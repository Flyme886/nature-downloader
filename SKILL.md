---
name: nature-downloader
description: Use this skill whenever the user wants to configure school/library access, reuse a logged-in Chrome institutional session, search library databases, download legitimate open-access or institution-authorized academic full text/PDFs, handle missing library permission, organize papers, or read PDFs and supporting information.
metadata:
  compatibility: Requires a local Chrome session logged in by the user, Chrome remote debugging permission, Python 3 for configuration, and Node.js 22+ or a bundled Node runtime for download scripts. Uses only user-authorized access. Claude Code may need installation under .claude/skills.
---

# Nature Literature Downloader

This skill turns a user's legitimate institutional access into a repeatable process for configuring, finding, downloading, and reading academic full text. It combines a first-run library-resource configuration wizard (`src/`, `data/`, `scripts/configure_school.py`) with browser-based download scripts (`scripts/batch_download.mjs`, `scripts/browser_pdf_downloader.mjs`) that reuse the user's already-authenticated Chrome session.

The currently verified real download route is the SJTU / jAccount / CARSI / Web of Science route. Other institutions should start from the user's actual library resource URL, because resource portals, CAS callbacks, EZproxy, WebVPN, and database detail pages reveal the live authorization path more reliably than a school name.

> **Access model — read this first.** For a new user, do not begin by asking for the school name or by applying a preset. First ask for the library electronic-resource link they actually use. Inspect that URL to classify the route as a resource portal, CAS/SSO login, CARSI/Shibboleth, EZproxy, WebVPN, IP-authorized database page, or publisher/database detail page. School presets are optional enrichment and fallback only.

> **Main workflow.** First configure and save the user's real library resource entry. Let the user log in through Chrome when the route reaches institutional authentication. Reuse the saved entry plus the current browser login state for later papers. For each paper, try legitimate open-access sources first; if the article is open access, download directly. Otherwise use the library route. If the library route clearly has no permission, tell the user directly instead of treating it as a generic download failure.

## First-Run Resource Configuration

For a brand-new user, ask for a library resource URL first:

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

Use school presets only when the user cannot provide a resource URL, or as a fallback after URL inference:

```bash
python3 scripts/configure_school.py preset "上海交通大学"
python3 scripts/configure_school.py show
python3 scripts/configure_school.py health --force
```

The default config path is:

```text
~/.config/lit-dl/school.json
```

For tests or isolated profiles, set:

```bash
LIT_DL_CONFIG_DIR=/path/to/configdir
```

The downloader reads this config automatically. If `discovery.web_of_science_url` is present, `scripts/batch_download.mjs` uses it as the Web of Science entry; otherwise it falls back to `https://webofscience.clarivate.cn/wos/woscc/basic-search`.

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

If the URL is a login page with a `service=` parameter, treat the callback host as the resource service and do not make the login page the whole workflow. Example: `cas.whu.edu.cn/authserver/login?...service=uas.metaauth.com/...` means WHU CAS authenticates the user, then returns to the metaauth/UAS resource portal. If the user provides `https://whu.metaersp.cn/personalIndex`, use that portal as the starting resource entry and let it redirect to CAS only when needed.

## Domains to recognize (SJTU)

Confirm against what actually appears in the user's address bar; correct these if the user's session shows different hosts.

```text
Library home / 聚合服务:     www.lib.sjtu.edu.cn, old.lib.sjtu.edu.cn
Discovery entry (fixed):     webofscience.clarivate.cn (SJTU mirror), www.webofscience.com, *.webofknowledge.com, *.clarivate.com
Unified identity (SSO):      jaccount.sjtu.edu.cn          <- the "stop, let user log in" trigger
SJTU CARSI IdP (Shibboleth): idp.sjtu.edu.cn               <- confirm exact host with the user
CARSI federation / WAYF:     ds.carsi.edu.cn, *.carsi.edu.cn
```

Treat `jaccount.sjtu.edu.cn`, `idp.sjtu.edu.cn`, and `*.carsi.edu.cn` as the institutional sign-in stage — the equivalent of a CAS handoff. Do not treat reaching them as a final failure.

## Boundaries

Use only the user's legitimate institutional access. Do not bypass paywalls, DRM, CAPTCHA, Cloudflare, publisher bot checks, or two-factor authentication. If a page asks for CAPTCHA, QR login, SMS/OTP, Cloudflare, publisher bot checks, or a security challenge, stop and ask the user to complete it in Chrome.

Avoid mass downloading. Work in small batches, preferably after the user confirms the paper list. Leave a clear audit trail of what was downloaded, from where, and whether supporting information was found.

Do not ask the user to paste jAccount passwords, CARSI credentials, OTP codes, recovery codes, or session tokens into chat or terminal. If the user offers a password, decline and use the handoff-login workflow instead.

Exception for SJTU jAccount saved-login pages: if the user explicitly says that Chrome has already filled the jAccount credentials and authorizes clicking the login/confirm button, the agent may click that button once on the jAccount / CARSI IdP / institutional SSO page without reading, copying, or typing any credential. This exception does not apply to CAPTCHA, QR login, SMS/OTP, publisher bot checks, or any page outside the expected institutional login flow.

Do not inspect or export cookies, passwords, local storage, browser profiles, or session files. Use the browser's already-authenticated page context only.

## Preconditions

Before attempting downloads, confirm these conditions:

1. Chrome is open on the user's machine.
2. The school configuration exists and is valid.
   - Run `python3 scripts/configure_school.py show`.
   - If missing, run `python3 scripts/configure_school.py preset "<school name>"` or guide the user through `src/wizard.py`.
3. The user has personally logged in to their institution/library/CARSI route in Chrome, and can reach the library aggregation service or Web of Science entry.
   - SJTU common pages: `https://www.lib.sjtu.edu.cn/`, `https://old.lib.sjtu.edu.cn/`, the 学术资源文献聚合访问服务 database list.
4. Chrome remote debugging is allowed for the current browser instance.
   - Ask the user to open `chrome://inspect/#remote-debugging`.
   - They must enable `Allow remote debugging for this browser instance`.
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

Small batches are supported when the user provides a definite DOI/title/PMID list.

Recommended limits:

- normal batch: 5-10 papers
- upper practical batch: 15-20 papers, with pauses and a manifest
- stop immediately if publisher checks, CAPTCHA, jAccount/CARSI expiry, or unusual download prompts appear

Do not turn a broad keyword search into unlimited automatic downloading. Do not download whole journal issues, volumes, or large result sets.

## Status Categories

Classify every paper into one of these statuses, and keep the status in the manifest:

```text
downloaded
downloaded_with_si
open_access_downloaded
full_text_html_available
available_not_downloaded
carsi_waiting_user
carsi_resolved_retry_needed
publisher_verification_waiting_user
sciencedirect_robot_check
retry_after_user_verification
do_not_auto_retry
url_needs_repair
library_no_permission
no_full_text_link
publisher_blocked_waiting_user
no_authorized_pdf_found
failed_after_retry
```

Use `carsi_waiting_user` only when the browser is visibly at jAccount / CARSI IdP / unified identity authentication. Do not treat this as a final failure.

Use `publisher_verification_waiting_user` or `sciencedirect_robot_check` when a publisher page shows "Are you a robot?", CAPTCHA, Cloudflare, bot verification, or another anti-automation challenge. Do not treat this as a final failure, but do not try to solve it automatically.

Use `open_access_downloaded` when a legitimate open-access route such as PMC, the publisher's OA PDF, arXiv, or another lawful open PDF source provides the downloaded PDF without institutional authorization.

Use `full_text_html_available` when the library/full-text resolver grants access to a readable HTML full text but no valid PDF link or `%PDF` response is available. This is a successful full-text access result, not a PDF download. Save the HTML/text if the user asked for the article, and explicitly tell the user that the PDF was not available through the current authorized route.

Use `library_no_permission` when the library portal, SFX/OpenURL resolver, database, or publisher page clearly says the user's institution has no full-text entitlement for the paper. Tell the user plainly that the current library resources do not have permission for this article. Do not retry direct publisher access as if it were a temporary network problem.

## Start Chrome Control

Use the web-access CDP proxy when available.

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
- Do not attempt to read Chrome session files.

## Fast Batch Path (default for 2+ papers — fast & token-efficient)

For anything beyond a single paper, run `scripts/batch_download.mjs` instead of driving the browser step-by-step from the agent. It executes the whole chain (WoS search → record → DOI → publisher full text → download) inside Node + the CDP proxy, so **search DOMs and PDF bytes never enter the agent context** — only one compact JSON status line per paper comes back. A 10-paper run finishes in ~50s.

The script reads `~/.config/lit-dl/school.json` automatically. When the config contains `discovery.web_of_science_url`, that URL is used as the Web of Science entry; otherwise the SJTU mirror `https://webofscience.clarivate.cn/wos/woscc/basic-search` is used.

```bash
# by topic (collects N records from Web of Science Core Collection):
node scripts/batch_download.mjs --topic "rice blast resistance gene" --count 10 --out "<project>"
# by explicit DOIs:
node scripts/batch_download.mjs --dois "10.1007/s00122-021-03957-1,10.1111/pbi.14066" --out "<project>"
# by exact open-access title (arXiv fallback, useful for DOI-less papers):
node scripts/batch_download.mjs --title "Attention Is All You Need" --open-access --out "<project>"
# by known PDF URL:
node scripts/batch_download.mjs --pdf-url "https://arxiv.org/pdf/1706.03762" --title "Attention Is All You Need" --out "<project>"
# add --si only when the user asked for supporting information
```

Output: `{ summary:{total,downloaded,seconds}, results:[{doi,status,file,bytes}] }`. Per-paper `status` follows the **canonical Status Categories list above** (L83-98) — e.g. `downloaded`, `downloaded_with_si`, `carsi_waiting_user`, `publisher_verification_waiting_user`, `sciencedirect_robot_check`, `publisher_blocked_waiting_user`, `no_full_text_link`, `no_authorized_pdf_found`, `pdf_fetch_failed`, `failed_after_retry`, `do_not_auto_retry`. The stderr short tags `[dl]`/`[wos]`/`[doi]` are for readability only and are NOT status codes; JSON `status` always uses the canonical names. The script saves PDFs under `<project>/PDFs/`; pipe its JSON into the manifest. Pass `--legacy-status` to emit the old short codes (`needs_user_login`, `needs_user_verify`, `publisher_blocked`, `no_pdf_link`, `error`) for backward-compatible manifest consumers.

**Token discipline (applies to all paths):** never `eval` a whole page DOM, search result, or PDF/SI bytes back into the agent context. Keep large data inside Node/`scripts/*.mjs` and surface only compact status. Reserve interactive `/eval` + `cdp_open_url.mjs` for the single-paper route below or for diagnosing one stuck paper after the batch run.

## Recommended Download Workflow (Web of Science entry — single paper / fallback)

For institution-authorized access, start from Web of Science or the user's configured library resource portal. **Web of Science is the preferred discovery hub for library-routed papers — do not resolve or group by publisher first when the configured library route is available.** WoS searches by title or DOI, then exposes full-text links that carry the institutional session through to SFX/OpenURL, Ovid, or the publisher.

Before using the library route, check for legitimate open-access availability when the article metadata suggests OA or the user provides an OA/open journal paper. Use PMC, publisher OA links, arXiv, DOI landing pages with clear open PDF access, or a known lawful PDF URL. If an OA PDF is available, download and verify it directly, mark `open_access_downloaded`, and record the OA source in the manifest. Do not require institutional login for an article that is already openly available.

Important distinction: `--topic` is a Web of Science topic search, not an exact-title resolver. For a known exact title, especially conference/arXiv papers without DOI, prefer `--title "<exact title>" --open-access` or `--pdf-url` when the legitimate PDF URL is known. In testing, `--topic "Attention Is All You Need"` matched an unrelated HBR article first, while `--title "Attention Is All You Need" --open-access` correctly downloaded arXiv `1706.03762v7`.

Web of Science hosts to recognize: `webofscience.clarivate.cn` (the SJTU mirror, confirmed live), `www.webofscience.com`, `*.webofknowledge.com`, `*.clarivate.com`. Note: WoS renders records inside **shadow DOM with a virtualized list** — when scraping manually you must pierce shadow roots and scroll to load more rows (the batch script already does this).

1. **Authenticate once**: open Web of Science via the library aggregation / CARSI entry. If Web of Science shows an authentication preference page with "机构 身份验证 (Shibboleth or Open Athens)" and "IP 身份验证", choose institutional authentication and continue. If the page lands on jAccount / CARSI IdP, follow **CARSI Handoff** below (stop and let the user log in, or click the saved-login confirm button once if authorized).
2. Confirm you are on the authenticated Web of Science search page (institutional name visible, search box present).
3. Search the paper by **DOI** when available, otherwise by **exact title**:
   - Set the search field to `DOI` or `Title`, paste the value, run the search.
   - Read the results page with `/eval` and pick the record that matches title + year + authors.
4. Open the matching record and read it with `/eval`.
5. Click the full-text route, in this order of preference:
   - `Free Full Text` / `Open Access` if present
   - library resolver links: `Find it at`, `SFX`, `OpenURL`, `Full Text Links`, `查看全文`, `Full Text available via`, database/provider names such as Ovid
   - publisher full-text link: `View Full Text`, the publisher name, or `View PDF`
   - The full-text link inherits the CARSI session, so the publisher should grant access without a second login. If a second jAccount/CARSI handoff appears, complete it once.
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
6. Avoid retry loops. One failed automatic attempt is enough before handing the page to the user.

When a publisher verification page appears:

1. Stop automated actions on that tab.
2. Record the paper in `publisher_verification.tsv` or the main manifest with status `publisher_verification_waiting_user`; use `sciencedirect_robot_check` for ScienceDirect's "Are you a robot?" page.
3. Tell the user which paper and tab need manual attention.
4. Do not click CAPTCHA, Cloudflare, "Are you a robot?", bot-check, or similar challenge controls automatically.
5. After the user says the verification is complete, continue from the same tab and try the visible article/PDF route once.
6. If verification immediately reappears, mark `do_not_auto_retry` and move on.

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

## CARSI / jAccount Handoff and Retry

Publishers routed through CARSI/Shibboleth — Elsevier/ScienceDirect, Springer Nature, IEEE, Wiley, ACS, Taylor & Francis, Cell Press, and society platforms — will redirect to jAccount / the SJTU CARSI IdP for the first authenticated access. This is expected and is not a reason to ask for the user's password.

When a page reaches jAccount, the CARSI IdP, or a CARSI federation/WAYF selector:

1. Stop automated actions on that tab.
2. Record the paper in `carsi_retry.tsv` with status `carsi_waiting_user`.
3. Tell the user exactly which tab/page needs attention, for example: "This page is at SJTU jAccount. If Chrome has already filled the account and password, I can click the login/confirm button once with your authorization; otherwise please complete it in Chrome." If a CARSI WAYF/机构选择 page asks which institution, ask the user to pick `Shanghai Jiao Tong University` (or do so if it is an unambiguous, credential-free selection the user authorized).
4. Do not read, store, or request the password, QR result, OTP, SMS code, CAPTCHA, cookie, or local/session storage.
5. If the user explicitly authorizes clicking because the jAccount credentials are already filled in Chrome, click only the visible jAccount / CARSI IdP login/confirm button once. Do not type into fields or inspect hidden credential values.
6. If QR login, SMS/OTP, CAPTCHA, Cloudflare, or publisher bot verification appears, stop and let the user complete it manually.
7. After the login/confirm step completes, refresh or continue from the same tab.
8. Re-detect whether the page is now a publisher article page, a PDF viewer, or another institutional handoff.
9. If resolved, download and verify the PDF/SI, then update the manifest status to `downloaded` or `downloaded_with_si`.
10. If it loops back to jAccount/CARSI after a completed user login, record `failed_after_retry` with the observed reason and move on.

### Safe jAccount / CARSI Auto-Confirm

The agent may click a jAccount saved-login confirmation button only when all conditions are true:

```text
1. The page is on an expected institutional domain such as jaccount.sjtu.edu.cn, idp.sjtu.edu.cn, *.carsi.edu.cn, www.lib.sjtu.edu.cn, or old.lib.sjtu.edu.cn.
2. The user has explicitly authorized this action in the current conversation, for example: "可以点交大 jAccount 登录按钮".
3. The visible action is clearly a login/confirm/continue button, such as 登录, 登 录, 确认登录, 继续登录, Continue, Proceed, or Sign in.
4. There is no visible CAPTCHA, Cloudflare challenge, QR-only login, SMS/OTP field, push-approval prompt, password reset prompt, consent-to-share-new-data prompt, or account/security warning.
5. The agent does not read, reveal, copy, store, type, or modify credentials.
```

A CARSI WAYF/机构选择 page (choosing `Shanghai Jiao Tong University`) carries no credentials and may be selected when the user has authorized it. If any condition is unclear, pause and ask the user to handle that tab. Do not repeatedly click login; one click is enough to test whether the saved-login state works.

Create or update `carsi_retry.tsv` whenever jAccount/CARSI blocks a batch. Use this header:

```text
id	project	title	doi	year	venue	publisher	failure_stage	status	source_url	current_url	next_action	notes
```

Suggested `next_action` values:

```text
user_complete_jaccount_in_chrome
select_sjtu_in_carsi_wayf
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
& $node "$env:USERPROFILE\.agents\skills\sjtu-literature-downloader\scripts\browser_pdf_downloader.mjs" `
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

**Do not download supporting information by default — download the main PDF only.** Fetch SI only when the user explicitly asks for it (e.g. "连补充材料一起下", "include SI", "download supplementary", "把补充材料也下了"). When you skip SI, still glance at the landing page and record in the manifest whether SI appears to exist (`si_status = available_not_downloaded`) so the user can ask for it later; do not spend extra navigation just to enumerate the files.

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
python -X utf8 "$env:USERPROFILE\.claude\skills\sjtu-literature-downloader\scripts\extract_pdf_text.py" `
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

- Do not bypass it.
- Do not auto-click the challenge.
- Record `publisher_verification_waiting_user` or `sciencedirect_robot_check`.
- Ask the user to solve it in Chrome.
- Then continue once from the same now-open page.
- If the same challenge immediately reappears, mark `do_not_auto_retry` and move on.

If shell `Invoke-WebRequest` or `curl` returns 403 but the PDF opens in Chrome:

- Use `browser_pdf_downloader.mjs`; this is the normal institutional-access case.

If a page shows publisher bot verification, CAPTCHA, Cloudflare, QR login, SMS/OTP, or another security challenge:

- Do not ask for or accept credentials in chat.
- Pause and ask the user to complete the verification in Chrome.
- Record `publisher_verification_waiting_user` in `publisher_verification.tsv`, or `sciencedirect_robot_check` for ScienceDirect.
- Continue only after the user says the browser step is complete.

If a page shows jAccount, the SJTU CARSI IdP, CARSI WAYF/机构选择, Shibboleth, OpenAthens, or SAML institutional sign-in:

- Do not ask for or accept credentials in chat.
- If the user has explicitly authorized it and Chrome has already filled the jAccount fields, click the visible login/confirm button once.
- Otherwise pause and ask the user to complete the login in Chrome.
- Record `carsi_waiting_user` or `carsi_resolved_retry_needed` in `carsi_retry.tsv` as appropriate.

If the aggregation entry shows no full-text link:

- Try the publisher's own `机构登录 / CARSI` route and select `Shanghai Jiao Tong University`.
- Try the DOI on the publisher page once a CARSI session exists.
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

- Ask the user to re-authenticate jAccount in Chrome, then reopen the publisher's aggregation/CARSI entry.

## To Confirm With The User (first run)

These few items depend on the live SJTU session and should be confirmed once, then locked into this file:

1. The exact SJTU CARSI IdP host (`idp.sjtu.edu.cn` assumed — verify in the address bar at login).
2. The base URL / link pattern of the 学术资源文献聚合访问服务 entries for the publishers the user actually uses.
3. Whether a CARSI WAYF/机构选择 step appears, and whether the user authorizes auto-selecting `Shanghai Jiao Tong University`.
