---
name: nature-downloader
description: Use when a user needs lawful academic full text, CNKI institutional access, English OA retrieval, publisher API access, institutional browser fallback, or supporting information downloads.
metadata:
  compatibility: Requires Node.js 22+ and Python 3. CNKI, Web Access, and SI routes additionally require the user's authenticated Chrome session and remote debugging. Uses only lawful OA, publisher API, and user-authorized institutional access.
---

# Nature Literature Downloader

This skill routes literature through lawful open-access, publisher-API, CNKI institutional, and browser-based institutional providers. `scripts/batch_download.mjs` is the orchestration entry point; school configuration, publisher credentials, metadata/OA resolution, provider downloads, content validation, and manifests are separate modules.

Verified routes are examples, not defaults. Every institution should start from the user's actual library resource URL, because resource portals, CAS callbacks, EZproxy, WebVPN, IP-authenticated database pages, and database detail pages reveal the live authorization path more reliably than a school name.

> **SI confirmation gate — do this first.** Before downloading any PDF, CAJ, HTML, XML, archive, or attachment, ask whether the user wants Supporting Information. An explicit request for SI counts as yes; an explicit request for正文 only counts as no. Otherwise ask once for the whole batch. Run the downloader with exactly one of `--si` or `--no-si`. Without either flag the script returns `si_confirmation_required` and does not create the output directory.

> **Main workflow.** Normalize the DOI/title and identify language and publisher before routing. Chinese literature always uses CNKI. For English Elsevier, Springer Nature, and IEEE articles with usable provider credentials, try the publisher API first and do not require an OA determination after a successful API download. If that API attempt fails, automatically check legitimate OA sources. Other English publishers check OA first, then use the institutional Web Access route when OA is unavailable.

```text
规范化 DOI/题名并识别语言、出版商
├─ 中文文献：直接走 CNKI
└─ 英文文献
   ├─ Elsevier / Springer Nature / IEEE，且已配置有效 Key
   │  ├─ 优先通过出版商 API 下载
   │  ├─ API 下载成功：结束，不强制判断 OA
   │  └─ API 下载失败：检查文章级 OA，再走 PMC / Unpaywall / 合法仓储
   └─ 其他出版商
      ├─ 检查文章级 OA
      └─ OA 不可用：走 Web Access 机构授权
```

> **Chinese literature is CNKI-only.** A Chinese title, `zh` metadata language, explicit CNKI source URL, or `--route cnki` must use CNKI even if another OA copy appears to exist. Reuse the user's current Chrome library/CNKI login state and prefer configured `discovery.cnki_url`. Never export cookies or collect the institutional password.

> **Publisher API fallback.** A valid API key does not guarantee full-text entitlement. When an Elsevier, Springer Nature, or IEEE API attempt returns no entitlement or no usable full text, automatically try legitimate OA sources first. Return `api_fallback_confirmation_required` and ask once whether to use Web Access only after both the publisher API and OA routes fail. Do not switch to institutional Web Access automatically.

> **Browser-state principle.** Authorized downloads depend on the exact browser profile where the user is logged in. If a proxy, CDP session, or browser automation tool opens a fresh profile or a different browser with no login state, do not treat the failure as missing library permission. Switch to a control path that reuses the user's active browser session, or ask the user to authenticate in the controlled browser instance.

> **Format principle.** PDF, HTML full text, and database-native formats such as CAJ are different deliverables. If the user asks for PDF only, require a real PDF link or `%PDF` response and report `no_authorized_pdf_found` / `pdf_fetch_failed` when none exists. Do not save CAJ, HTML, or a login page as if it were a PDF.

## Download Intake and First-Run Configuration

For every download request, first establish the paper list and ask:

```text
是否同时下载这些文献的 Supporting Information（SI，补充材料）？
```

Do metadata lookup before this question only when needed to identify the requested papers. Do not download files until the answer is known. Configure a library only when the selected route is CNKI or Web Access. Configure a publisher API only when the selected English article belongs to Elsevier, Springer Nature, or IEEE; an OA determination is not required before trying a configured provider API.

### Paid Library Resource Configuration

Ask for the library resource URL the user actually uses:

```text
请发你平时进入图书馆电子资源/数据库的平台链接。
可以是资源门户、数据库列表、Web of Science 入口、某个数据库详情页，
或跳转到统一身份认证的登录链接。
```

Then infer the authorization route from the URL before saving config:

```bash
python3 scripts/configure_school.py infer "https://example.edu/library/resources"
python3 scripts/configure_school.py url "https://example.edu/library/resources"
python3 scripts/configure_school.py show
python3 scripts/configure_school.py health --force
```

The distributed skill contains no school presets. If the user cannot provide a resource URL, ask them to locate their institution's library/database entry instead of guessing a school-specific domain.

The default config path is:

```text
~/.config/lit-dl/school.json
```

For tests or isolated profiles, set:

```bash
LIT_DL_CONFIG_DIR=/path/to/configdir
```

The downloader reads this config automatically. If `discovery.web_of_science_url` is present, `scripts/batch_download.mjs` uses it as the Web of Science entry; otherwise it falls back to `https://www.webofscience.com/wos/woscc/basic-search`.

For Chinese literature, the downloader also reads `discovery.cnki_url` when present. If absent, `scripts/batch_download.mjs --title "<中文题名>"` falls back to `https://kns.cnki.net/kns8s/defaultresult/index`.

### API-First and Open-Access Fallback

For an English article, identify its publisher before deciding when to resolve article-level OA:

1. Collect a DOI, PMID, exact title, article URL, or a definite paper list, then normalize its metadata and publisher.
2. If it belongs to Elsevier, Springer Nature, or IEEE and usable provider credentials are configured, try that publisher API first. On success, record `accessMode: publisher_api` and `oa_status: not_checked_api_first`; do not run OA resolution only to label the article.
3. If the publisher API fails, automatically search legitimate OA sources such as PMC, Unpaywall, publisher OA pages, arXiv, and other lawful repositories or clearly open PDF URLs. Preserve the failed API attempt in the manifest.
4. For all other English publishers, search those legitimate OA sources before Web Access.
5. For an exact title or an explicit OA-only request, prefer:

   ```bash
   node scripts/batch_download.mjs --title "<exact title>" --open-access --no-si --out "<project>"
   ```

   Use `--pdf-url` when the user supplies a known legitimate OA PDF URL.
6. Verify the downloaded file and record the source. Mark a successful PDF as `open_access_downloaded`.
7. If no lawful OA full text is found, mark `oa_not_found`. For a supported publisher whose API already failed, request confirmation before Web Access. For another publisher, continue to Web Access. If `--route open_access` was explicitly requested, stop after the OA result.

### Publisher API Credentials

Configure credentials lazily, only when the route first needs them:

```bash
python3 scripts/configure_credentials.py set elsevier
python3 scripts/configure_credentials.py set springer_nature
python3 scripts/configure_credentials.py set ieee --fulltext-endpoint 'https://issued-endpoint.example/articles/{doi}'
python3 scripts/configure_credentials.py set elsevier --stdin
python3 scripts/configure_credentials.py show
python3 scripts/configure_credentials.py validate <provider>
python3 scripts/configure_credentials.py delete <provider>
python3 scripts/configure_credentials.py contact-email researcher@example.org
```

Give the user the official registration link: Elsevier `https://dev.elsevier.com/`, Springer Nature `https://dev.springernature.com/docs/quick-start/api-access/`, or IEEE `https://developer.ieee.org/member/register`.

Do not proactively ask the user to paste an API key into chat. If the user voluntarily sends a publisher API key, treat that as authorization to save that exact key: do not reject it, ask them to regenerate it, or repeat it back. Pass it to `configure_credentials.py set <provider> --stdin`, keep it out of command-line arguments, logs, replies, and manifests, then report only the masked confirmation and validation status. The local hidden prompt remains the preferred path when the key has not already been provided. IEEE Metadata API access is not paid full-text access; require the issued Full-Text Access endpoint/template before treating IEEE as downloadable through the API. Secrets are stored in `~/.config/lit-dl/credentials.json` with mode `0600`.

## Resource URL Triage

Classify the user-provided URL before choosing an access path:

```text
cas.* / /authserver/login        CAS / SSO login page; inspect service= callback, then return to the service portal
idp/shibboleth / carsi           CARSI / Shibboleth institutional route
ezproxy / libproxy               EZproxy remote-access proxy
webvpn / vpn                     WebVPN route
metaersp / metaauth / uas        Library resource aggregation portal
webofscience / sciencedirect     Database or publisher entry; check whether it was reached through a portal
```

If the URL is a login page with a `service=` parameter, treat the callback host as the resource service and do not make the login page the whole workflow. For example, `https://login.university.example/authserver/login?service=https://resources.university.example/callback` means the identity service returns to the user's resource portal after authentication.

## Institution-Specific Domains

Confirm against what actually appears in the user's address bar; correct these for each institution instead of assuming a preset is complete.

```text
Library home / aggregation:  library.example.edu, resources.example.edu
Discovery/database entry:    webofscience.com, clarivate.com, cnki.net, sciencedirect.com, provider.example.com
Unified identity / SSO:      sso.example.edu, cas.example.edu, idp.example.edu
Federation / WAYF:           ds.carsi.edu.cn, wayf.example.org, shibboleth/openathens hosts
Proxy / WebVPN:              ezproxy.example.edu, webvpn.example.edu
```

Treat configured institutional login, federation, proxy, and database-login hosts as sign-in stages. Do not treat reaching them as a final failure.

## Boundaries

Use only the user's legitimate institutional access. Do not bypass paywalls, DRM, or two-factor authentication.

**Verification-first rule:** When a visible slider, checkbox, robot check, or simple verification control appears in the user's authenticated Chrome session, attempt it in the browser before asking the user to intervene. Keep the attempt bounded (at most two attempts on one tab), verify that the challenge disappeared, and continue from that same tab when successful.

- Slider/drag challenges (including CNKI puzzle sliders): estimate the visible travel distance and simulate a gradual drag.
- ScienceDirect robot checks, managed Turnstile, and reCAPTCHA checkbox stages: try the visible checkbox once.
- Simple `Continue`, `Verify`, or equivalent visible controls: click once, then re-check the page state.

**User handoff:** Ask the user only after the bounded attempt fails, or immediately when the page requires secret or identity-bearing input such as an image-selection answer, QR approval, SMS/OTP, passkey, hardware key, or two-factor authentication. Keep the challenged tab open and never ask the user to paste credentials or codes into chat.

Avoid unbounded or indiscriminate downloading. Process only the definite paper list confirmed by the user, apply provider-friendly pacing, and leave a clear audit trail of what was downloaded, from where, and whether supporting information was found.

Do not ask the user to paste institutional passwords, database passwords, OTP codes, recovery codes, or session tokens into chat or terminal. If the user offers one of those identity-bearing secrets, decline and use the handoff-login workflow instead. Publisher API keys follow the separate save-on-receipt rule above.

Exception for saved institutional login pages: if the user explicitly says that the browser has already filled credentials and authorizes clicking the visible login/confirm button, the agent may click that button once on the expected institutional SSO / CAS / CARSI / Shibboleth page without reading, copying, or typing any credential. This exception does not apply to CAPTCHA, QR login, SMS/OTP, publisher bot checks, consent/security warnings, or any page outside the expected institutional login flow.

Do not inspect or export cookies, passwords, local storage, browser profiles, or session files. Use the browser's already-authenticated page context only.

## Preconditions

Before attempting downloads, confirm the conditions that apply to the selected access branch.

For the OA-only branch, confirm the target paper identifier/list, output folder, Node.js 22+, and Python 3 when PDF verification needs it. Do not require a library configuration or institutional browser login.

For the paid-library branch, confirm these conditions:

1. The browser that holds the user's library/database login state is open on the user's machine.
2. The school configuration exists and is valid.
   - Run `python3 scripts/configure_school.py show`.
   - If missing, run `python3 scripts/configure_school.py preset "<school name>"` or guide the user through `src/wizard.py`.
3. The user has personally logged in to their institution/library route in that same browser, and can reach the library aggregation service, target database, or discovery entry.
4. The browser-control path can reuse that same logged-in browser profile.
   - For Chrome CDP, ask the user to open `chrome://inspect/#remote-debugging` and enable remote debugging for the current browser instance.
   - If CDP attaches to a stale browser, a temporary profile, or a different browser, use a browser-control channel that can reuse the user's active session instead of launching a new profile.
5. The environment can run Node.js 22+.
   - Try `node --version`.
   - If `node` is not on PATH in Codex Desktop, try `%LOCALAPPDATA%\OpenAI\Codex\bin\node.exe`.
6. The environment can run Python 3 for configuration and PDF text verification.
   - Try `python3 --version`.
   - Install Python helpers with `pip install -r requirements.txt` when needed.
7. The web-access CDP proxy is available or can be started.
   - Typical Claude Code path: `%USERPROFILE%\.claude\skills\web-access-main\scripts\check-deps.mjs`.
   - Typical shared agent path: `%USERPROFILE%\.agents\skills\web-access-main\scripts\check-deps.mjs`.
   - In Codex-only setups also check `%USERPROFILE%\.codex\skills\web-access-main\scripts\check-deps.mjs`.
8. The user has approved the target output folder.

If Claude Code says this skill is not installed, install or copy it to:

```powershell
$env:USERPROFILE\.claude\skills\nature-downloader
```

Codex and other agent setups may instead use `.codex\skills` or `.agents\skills`; treat the three locations as install targets, not as different skill versions.

## Batch Scope

Definite DOI/title/PMID lists are supported without a fixed per-batch paper-count recommendation.

Operational safeguards:

- pace requests appropriately for each provider and maintain the manifest throughout the batch
- attempt visible verification controls first; stop after at most two failed attempts, on institutional login expiry, or when an unusual/security-sensitive prompt appears

Do not turn a broad keyword search into unlimited automatic downloading. Do not download whole journal issues, volumes, or large result sets.

## Status Categories

Classify every paper into one of these statuses, and keep the status in the manifest:

```text
downloaded
downloaded_with_si
open_access_downloaded
full_text_html_available
available_not_downloaded
native_fulltext_downloaded
si_confirmation_required
credentials_missing
credentials_invalid
api_not_entitled
api_fulltext_unavailable
api_fallback_confirmation_required
oa_not_found
oa_resolution_inconclusive
metadata_ambiguous
carsi_waiting_user
carsi_resolved_retry_needed
publisher_verification_waiting_user
sciencedirect_robot_check
retry_after_user_verification
verification_auto_passed
verification_auto_failed
do_not_auto_retry
url_needs_repair
library_no_permission
no_full_text_link
publisher_blocked_waiting_user
no_authorized_pdf_found
failed_after_retry
```

Use `verification_auto_passed` when an automatic CAPTCHA/slider/robot check was successfully solved by the skill, and the download then proceeded normally.

Use `verification_auto_failed` when auto-verification was attempted but could not pass the challenge. This is a user-handoff status, not a final failure.

Use `carsi_waiting_user` only when the browser is visibly at an institutional SSO / CAS / CARSI-Shibboleth / OpenAthens / database authentication page. Do not treat this as a final failure.

Use `publisher_verification_waiting_user` or `sciencedirect_robot_check` when a publisher page shows a verification challenge but no automatic interaction was possible. When a bounded automatic attempt was made and failed, use `verification_auto_failed` instead. None of these is a final download failure.

Use `open_access_downloaded` when a legitimate open-access route such as PMC, the publisher's OA PDF, arXiv, or another lawful open PDF source provides the downloaded PDF without institutional authorization.

For a successful API-first download, record `oa_status: not_checked_api_first`; this means OA resolution was intentionally skipped, not that the article is non-OA. Use `api_fallback_confirmation_required` only after a supported publisher API attempt and its automatic OA fallback both fail.

Use `full_text_html_available` when the library/full-text resolver grants access to a readable HTML full text but no valid PDF link or `%PDF` response is available. This is a successful full-text access result, not a PDF download. Save the HTML/text if the user asked for the article, and explicitly tell the user that the PDF was not available through the current authorized route.

Use `library_no_permission` when the library portal, SFX/OpenURL resolver, database, or publisher page clearly says the user's institution has no full-text entitlement for the paper. Tell the user plainly that the current library resources do not have permission for this article. Do not retry direct publisher access as if it were a temporary network problem.

## Start Browser Control

Use the web-access CDP proxy when it can attach to the same logged-in browser instance the user is using. If the task depends on existing login state and CDP opens a blank/new profile, prefer a browser-control channel that reuses the user's active browser session.

On Windows PowerShell:

```powershell
$node = "node"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $node = "$env:LOCALAPPDATA\OpenAI\Codex\bin\node.exe"
}
$checkDepsCandidates = @(
  "$env:USERPROFILE\.claude\skills\web-access-main\scripts\check-deps.mjs",
  "$env:USERPROFILE\.agents\skills\web-access-main\scripts\check-deps.mjs",
  "$env:USERPROFILE\.codex\skills\web-access-main\scripts\check-deps.mjs"
)
$checkDeps = $checkDepsCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $checkDeps) { throw "web-access-main/scripts/check-deps.mjs not found" }
& $node $checkDeps
```

Then test:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3456/targets" -TimeoutSec 10
```

If this hangs or fails:

- Ask the user to confirm the remote debugging checkbox.
- Check `%TEMP%\cdp-proxy.log`.
- If targets appear but the database/library page is unauthenticated, suspect a stale CDP endpoint, wrong browser, or fresh browser profile before suspecting missing library permission.
- Do not attempt to read Chrome session files.

## Fast Batch Path (default for 2+ papers — fast & token-efficient)

For anything beyond a single paper, run `scripts/batch_download.mjs` instead of driving the browser step-by-step. OA and publisher APIs run without CDP; CNKI, Web Access, and requested SI lazily attach to the authenticated browser. Large DOMs and file bytes remain inside the scripts.

The script reads `~/.config/lit-dl/school.json` automatically. When the config contains `discovery.web_of_science_url`, that URL is used as the Web of Science entry; otherwise the script falls back to its compiled default Web of Science URL.

```bash
# by topic (collects N records from Web of Science Core Collection):
node scripts/batch_download.mjs --topic "rice blast resistance gene" --count 10 --no-si --out "<project>"
# by explicit DOIs:
node scripts/batch_download.mjs --dois "10.1007/s00122-021-03957-1,10.1111/pbi.14066" --no-si --out "<project>"
# by exact open-access title (arXiv fallback, useful for DOI-less papers):
node scripts/batch_download.mjs --title "Attention Is All You Need" --open-access --no-si --out "<project>"
# by Chinese exact title (default CNKI route):
node scripts/batch_download.mjs --title "乡村振兴背景下数字治理研究" --no-si --out "<project>"
# by Chinese exact title, PDF only:
node scripts/batch_download.mjs --title "乡村振兴背景下数字治理研究" --cnki-format pdf --no-si --out "<project>"
# by Chinese exact title with a library-provided CNKI entry:
node scripts/batch_download.mjs --title "乡村振兴背景下数字治理研究" --cnki-url "https://kns.cnki.net/kns8s/defaultresult/index" --no-si --out "<project>"
# by known PDF URL:
node scripts/batch_download.mjs --pdf-url "https://arxiv.org/pdf/1706.03762" --title "Attention Is All You Need" --no-si --out "<project>"
# replace --no-si with --si only after the user explicitly requests SI
```

Output includes `{ summary, manifest, results }`. The script writes `<project>/manifest.json` with route, OA evidence, access mode, format, MIME, bytes, SHA-256, SI choice, and typed failures; secret-looking fields are removed recursively. PDFs go under `PDFs/`, native HTML/XML under `FullText/`, CAJ under `CNKI/`, and supplements under `SupportingInformation/`.

**Token discipline (applies to all paths):** never `eval` a whole page DOM, search result, or PDF/SI bytes back into the agent context. Keep large data inside Node/`scripts/*.mjs` and surface only compact status. Reserve interactive `/eval` + `cdp_open_url.mjs` for the single-paper route below or for diagnosing one stuck paper after the batch run.

## Recommended Web Access Workflow (other publishers and confirmed API-plus-OA fallback)

Use this section only after legitimate OA sources are unavailable: directly for English publishers outside Elsevier/Springer Nature/IEEE, or after the user explicitly accepts Web Access fallback when both a supported publisher API and the OA fallback failed. Start from Web of Science or the configured library portal and reuse the user's authenticated browser session.

Before using the library route, check for legitimate open-access availability when the article metadata suggests OA or the user provides an OA/open journal paper. Use PMC, publisher OA links, arXiv, DOI landing pages with clear open PDF access, or a known lawful PDF URL. If an OA PDF is available, download and verify it directly, mark `open_access_downloaded`, and record the OA source in the manifest. Do not require institutional login for an article that is already openly available.

Important distinction: `--topic` is a Web of Science topic search, not an exact-title resolver. For a known exact title, especially conference/arXiv papers without DOI, prefer `--title "<exact title>" --open-access` or `--pdf-url` when the legitimate PDF URL is known. In testing, `--topic "Attention Is All You Need"` matched an unrelated HBR article first, while `--title "Attention Is All You Need" --open-access` correctly downloaded arXiv `1706.03762v7`.

Web of Science hosts to recognize: `webofscience.clarivate.cn`, `www.webofscience.com`, `*.webofknowledge.com`, `*.clarivate.com`. Note: WoS renders records inside **shadow DOM with a virtualized list** — when scraping manually you must pierce shadow roots and scroll to load more rows (the batch script already does this).

1. **Authenticate once**: open Web of Science via the library aggregation / institutional entry. If Web of Science or another database shows authentication choices such as institutional login, Shibboleth/OpenAthens/CARSI, CAS/SSO, or IP login, use the route the user normally uses. If credentials, QR, CAPTCHA, SMS/OTP, or unclear consent appears, follow **Institutional Authentication Handoff** below.
2. Confirm you are on the authenticated Web of Science search page (institutional name visible, search box present).
3. Search the paper by **DOI** when available, otherwise by **exact title**:
   - Set the search field to `DOI` or `Title`, paste the value, run the search.
   - Read the results page with `/eval` and pick the record that matches title + year + authors.
4. Open the matching record and read it with `/eval`.
5. Click the full-text route, in this order of preference:
   - `Free Full Text` / `Open Access` if present
   - library resolver links: `Find it at`, `SFX`, `OpenURL`, `Full Text Links`, `查看全文`, `Full Text available via`, database/provider names such as Ovid
   - publisher full-text link: `View Full Text`, the publisher name, or `View PDF`
   - The full-text link should inherit the institutional session, so the publisher often grants access without a second login. If a second institutional handoff appears, complete it once.
6. On the publisher page, find the PDF link (`PDF`, `View PDF`, `Download PDF`, `pdfft`, `/doi/pdf/`) and save it with `scripts/browser_pdf_downloader.mjs`.
7. If the full-text resolver opens readable HTML full text but no valid PDF is exposed, save the HTML/text, mark `full_text_html_available`, and tell the user plainly: "已获取 HTML 全文，但当前授权路径没有可下载 PDF." Do not mislabel an HTML page as a PDF; if a PDF probe returns HTML, move it to diagnostics and explain that no valid PDF was downloaded.
8. If the resolver/provider explicitly says the institution has no entitlement, mark `library_no_permission` and tell the user: "当前图书馆资源没有该文献全文权限." Do not hide this behind `failed_after_retry`.
9. **Do not download Supporting Information by default.** Only fetch SI if the user explicitly asked; otherwise just note whether SI exists (see Supporting Information below).
10. Record the route taken (OA source or WoS → SFX/OpenURL/full-text provider → publisher/database) in the manifest.

If Web of Science returns no record, or the record has no accessible full-text link, mark the paper `no_full_text_link` and tell the user. If the library route is found but denies entitlement, mark `library_no_permission`. Do not silently fall back to direct publisher navigation as if it were the same authorized route.

## Publisher Verification and ScienceDirect

ScienceDirect and some publisher platforms may show "Are you a robot?", CAPTCHA, Cloudflare, bot verification, or similar checks after repeated direct DOI navigation or automated tab opening. These pages are security and anti-automation challenges, not ordinary login confirmations.

Reduce the chance of triggering them by using a conservative access pattern:

1. Prefer the library aggregation / CARSI entry before direct `doi.org -> publisher` navigation.
2. Process ScienceDirect and other sensitive publishers one article at a time.
3. Keep a visible audit trail in the manifest; do not open many publisher tabs in parallel.
4. Wait for each page to settle before looking for `Download PDF`, `View PDF`, or `PDF`.
5. Reuse the same tab after the user completes a verification step instead of opening repeated new tabs.
6. Avoid retry loops. Use one attempt by default and no more than two attempts on the same tab before handing the page to the user.

When a publisher verification page appears:

1. First, **attempt automatic verification** via the built-in anti-bot module (`scripts/lib/anti-bot.mjs`). The module tries: simple click challenges, ScienceDirect robot check, Cloudflare Turnstile, slider CAPTCHA (including CNKI Geetest-style), and reCAPTCHA checkbox.
2. If auto-verification succeeds, continue the download from the resolved page.
3. If auto-verification fails:
   a. Stop automated actions on that tab.
   b. Record the paper with status `verification_auto_failed`. Use `sciencedirect_robot_check` only when no automatic interaction was possible.
   c. Tell the user which paper and tab need manual attention.
   d. After the user says the verification is complete, continue from the same tab and try the visible article/PDF route once.
   e. If verification immediately reappears, mark `do_not_auto_retry` and move on.

Create or update `publisher_verification.tsv` when publisher checks interrupt a batch. Use this header:

```text
id	project	title	doi	year	venue	publisher	status	source_url	current_url	next_action	notes
```

Suggested `next_action` values:

```text
user_complete_publisher_verification
retry_same_tab_after_user_confirms
try_aggregation_entry_route
try_authorized_oa_route
mark_do_not_auto_retry
```

## Institutional Authentication Handoff and Retry

Publishers and databases routed through CAS/SSO, CARSI/Shibboleth, OpenAthens, EZproxy, WebVPN, or IP authorization may redirect to an institutional login or database login page for the first authenticated access. This is expected and is not a reason to ask for the user's password.

When a page reaches an institutional login page, federation/WAYF selector, database login page, or IP-login prompt:

1. Stop automated actions on that tab.
2. Record the paper in `carsi_retry.tsv` with status `carsi_waiting_user`.
3. Tell the user exactly which tab/page needs attention, for example: "This page is at your institution/database login. If the browser has already filled credentials, I can click the visible login/confirm button once with your authorization; otherwise please complete it in the browser." If a federation/WAYF page asks which institution to use, ask the user to pick their institution, or do it only when the choice is unambiguous and credential-free and the user authorized it.
4. Do not read, store, or request the password, QR result, OTP, SMS code, CAPTCHA, cookie, or local/session storage.
5. If the user explicitly authorizes clicking because credentials are already filled, click only the visible login/confirm/continue button once. Do not type into fields or inspect hidden credential values. For credential-free options such as "IP login", click only when the user authorizes that route or has just completed it manually.
6. If QR login, SMS/OTP, CAPTCHA, Cloudflare, or publisher bot verification appears, stop and let the user complete it manually.
7. After the login/confirm step completes, refresh or continue from the same tab.
8. Re-detect whether the page is now a publisher article page, a PDF viewer, or another institutional handoff.
9. If resolved, download and verify the PDF/SI, then update the manifest status to `downloaded` or `downloaded_with_si`.
10. If it loops back to the same institutional/database login after a completed user login, record `failed_after_retry` with the observed reason and move on.

### Safe Institutional Auto-Confirm

The agent may click a saved-login confirmation button only when all conditions are true:

```text
1. The page is on an expected institutional, library, federation, or database domain for the user's configured route.
2. The user has explicitly authorized this action in the current conversation, for example: "可以点这个机构登录确认按钮".
3. The visible action is clearly a login/confirm/continue button, such as 登录, 登 录, 确认登录, 继续登录, Continue, Proceed, or Sign in.
4. There is no visible QR-only login, SMS/OTP field, push-approval prompt, password reset prompt, consent-to-share-new-data prompt, or account/security warning. (Slider CAPTCHAs and simple robot checks are now auto-attemptable — see Boundaries.)
5. The agent does not read, reveal, copy, store, type, or modify credentials.
```

A federation/WAYF/机构选择 page carries no credentials and may be selected when the institution is unambiguous and the user has authorized it. If any condition is unclear, pause and ask the user to handle that tab. Do not repeatedly click login; one click is enough to test whether the saved-login state works.

Create or update `carsi_retry.tsv` whenever institutional authentication blocks a batch. Use this header:

```text
id	project	title	doi	year	venue	publisher	failure_stage	status	source_url	current_url	next_action	notes
```

Suggested `next_action` values:

```text
user_complete_institution_login_in_chrome
select_institution_in_federation_wayf
retry_same_tab_after_user_confirms
repair_url_by_doi
try_aggregation_entry_route
mark_no_authorized_pdf
```

For a CARSI retry batch, process one or a few tabs at a time. Do not open many login tabs in parallel; it can confuse the user's session and increase publisher or SSO risk.

## Download PDF From Browser Context

Use the bundled script when a PDF URL opens in Chrome but direct shell download returns `403`, `401`, Cloudflare HTML, or a login page.

```powershell
$node = "$env:LOCALAPPDATA\OpenAI\Codex\bin\node.exe"
& $node "$env:USERPROFILE\.agents\skills\nature-downloader\scripts\browser_pdf_downloader.mjs" `
  --url "https://www.sciencedirect.com/science/article/pii/SXXXXXXXXXXXXXXXX/pdfft" `
  --out "D:\path\paper.pdf"
```

The script:

- Opens the URL in the user's controlled Chrome session unless `--target` is provided.
- Runs `fetch(location.href, { credentials: "include" })` inside the page.
- Transfers bytes in chunks through the local CDP proxy.
- Writes the binary file to disk.
- Verifies the `%PDF` signature by default.

Useful options:

```text
--url <url>          PDF URL to open and save
--target <targetId>  Existing Chrome target/tab id to use
--out <path>         Output PDF path
--proxy <url>        CDP proxy URL, default http://127.0.0.1:3456
--close              Close the tab after download if the script opened it
--allow-non-pdf      Save even when content does not start with %PDF
```

## Supporting Information

**Always confirm SI before file download.** Fetch SI only when the user explicitly chooses it (e.g. "连补充材料一起下", "include SI", "download supplementary", "把补充材料也下了"). When the user chooses no, pass `--no-si` and do not perform extra attachment navigation.

When the user does ask for supporting information, use this method:

1. Open the article landing page, not only the PDF page.
2. Extract all links with text or href matching:
   - `Supporting Information`
   - `Supplementary`
   - `Supplemental`
   - `/doi/suppl/`
   - `/suppl_file/`
   - `_si_`
   - `mmc1`, `mmc2` (Elsevier/ScienceDirect supplement pattern)
3. Download every PDF/DOCX/XLSX/video/data file that is clearly a legitimate supplement, using the browser context if needed.

For the WoS batch route, an explicit SI request maps to `--si`. When an exact title is known, pass it as both `--topic` and `--title` with `--count 1`. WoS + `--si` must:

- keep each paper in its own readable-title folder;
- place only the verified main PDF and clearly labelled SI files in that folder;
- preserve original attachment names when available;
- follow a supplementary landing page at most one level deep;
- exclude external repository links such as GitHub, Zenodo, Figshare, Dryad, and OSF;
- keep the main PDF and report `si.status = not_found` when no SI exists;
- report `partial` when some SI files fail without treating the main PDF as failed.

Do not apply the clean per-article folder behavior to CNKI, `--open-access`, bare `--pdf-url`, or direct `--dois` routes.

ACS fallback pattern, only after verifying the DOI and article page:

```text
https://pubs.acs.org/doi/suppl/<DOI>/suppl_file/<journal-code>_si_001.pdf
```

Do not invent supplement URLs as facts. If a guessed URL returns 404, record "not found" and inspect the article page.

## Verification and Reading

After downloading, verify every file.

For PDFs:

```powershell
$env:PYTHONUTF8='1'
python -X utf8 "$env:USERPROFILE\.claude\skills\nature-downloader\scripts\extract_pdf_text.py" `
  --pdf "D:\path\paper.pdf" `
  --pages 3
```

This should report page count and extracted text. The script also reconfigures stdout/stderr to UTF-8 internally to reduce Windows GBK failures. If extraction fails but the PDF is valid, try PyMuPDF, OCR, or the local `pdf` skill.

Minimum verification checklist:

- File exists and size is plausible.
- First bytes are `%PDF` for PDF files.
- Page count is nonzero.
- Extracted text includes the article title, abstract, or supporting information title.
- For HTML full text, saved HTML/text includes the article title or DOI, and the user-facing reply states that no valid PDF was available.
- Save a small manifest with DOI, title, source URL, download date, and supplement status when doing more than one paper.

## Zotero

Zotero import is useful for metadata, DOI, citation keys, and library organization, but it does not replace local PDF verification. If Zotero imports a paper, still check whether the PDF attachment is present and readable. If the user wants a project folder with full text, save PDFs explicitly to that folder.

## Naming Convention

Use readable filenames:

```text
FirstAuthor_Year_Journal_short-title.pdf
FirstAuthor_Year_Journal_short-title_SI.pdf
```

For project work, keep a folder like:

```text
文献自动下载/
  manifest.tsv
  PDFs/
  SupportingInformation/
  extracted_text/
```

## Failure Handling

If direct publisher navigation triggers ScienceDirect "Are you a robot?", Cloudflare, CAPTCHA, or another bot challenge:

- First, attempt automatic verification via `scripts/lib/anti-bot.mjs`.
- If auto-verification succeeds, continue the download normally.
- If auto-verification fails, record `verification_auto_failed` or `sciencedirect_robot_check`.
- Ask the user to solve it in Chrome.
- Then continue once from the same now-open page.
- If the same challenge immediately reappears, mark `do_not_auto_retry` and move on.

If shell `Invoke-WebRequest` or `curl` returns 403 but the PDF opens in Chrome:

- Use `browser_pdf_downloader.mjs`; this is the normal institutional-access case.

If a page shows publisher bot verification, CAPTCHA, Cloudflare, QR login, SMS/OTP, or another security challenge:

- Do not ask for or accept institutional credentials in chat. Publisher API keys follow the separate save-on-receipt rule.
- Pause and ask the user to complete the verification in Chrome.
- Record `publisher_verification_waiting_user` in `publisher_verification.tsv`, or `sciencedirect_robot_check` for ScienceDirect.
- Continue only after the user says the browser step is complete.

If a page shows institutional SSO, CAS, CARSI/Shibboleth, OpenAthens, SAML, federation/WAYF/机构选择, database login, or IP-login options:

- Do not ask for or accept institutional credentials in chat. Publisher API keys follow the separate save-on-receipt rule.
- If the user has explicitly authorized it and the browser has already filled credentials, click the visible login/confirm button once.
- Otherwise pause and ask the user to complete the login in the browser.
- Record `carsi_waiting_user` or `carsi_resolved_retry_needed` in `carsi_retry.tsv` as appropriate.

If the aggregation entry shows no full-text link:

- Try the publisher's own `Institutional login` / `机构登录` / CARSI/Shibboleth/OpenAthens route and select the user's institution when authorized.
- Try the DOI on the publisher page once an institutional session exists.
- Check open-access copies only from legitimate sources.
- Record `no_authorized_pdf_found` rather than seeking unauthorized mirrors.

If a page opens as `about:blank`:

- Treat it as a URL-fragment/encoding problem first, especially when the original URL contains `#` or `#!`.
- Reopen through `scripts/cdp_open_url.mjs --url "<full URL>" --wait`.
- Do not paste fragment-heavy URLs unquoted into shell commands or manually concatenate them into `/new?url=...` without URL encoding.

If `curl` is unavailable:

- Use PowerShell `Invoke-WebRequest` for simple proxy checks.
- Prefer the bundled Node.js helper scripts for CDP proxy actions because Node's `URLSearchParams` preserves nested URL fragments correctly.

If the session expires:

- Ask the user to re-authenticate through their institution/library route in the same browser, then reopen the publisher/database entry.

## To Confirm With The User (first run)

These items depend on the user's live institution/library session and should be confirmed once per deployment or institution profile:

1. The exact institutional login, federation, proxy, WebVPN, or database hosts that appear in the address bar.
2. The base URL / link pattern of the library aggregation or database entries the user actually uses.
3. Whether a federation/WAYF/机构选择, IP-login, or database-login step appears, and whether the user authorizes selecting the unambiguous institution/login option.
