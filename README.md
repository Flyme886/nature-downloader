# nature-downloader

A Codex/Claude skill for legally downloading, retrying, and reading academic PDFs through the user's own logged-in Shanghai Jiao Tong University (SJTU) Library session, using jAccount + CARSI federated access — no VPN required.

中文简介：这是一个面向交大图书馆（jAccount 统一身份认证 + CARSI 学术资源文献聚合访问服务）场景的文献下载、失败重试与全文读取 skill。它使用用户自己已经登录的 Chrome 会话，在授权范围内保存 PDF 和 supporting information，并对文件做页数、PDF 签名和文本可读性验证。适合“网页里能打开 PDF，但命令行下载 403/401/登录页”“jAccount/CARSI 认证中断批量下载”“ScienceDirect/出版商人机验证后需要继续同一页下载”的情况。

> **访问模型说明（与 WebVPN 不同）**：CARSI 不改写网址。用 jAccount 登录一次后，会话通过 CARSI 带到资源站。**本 skill 固定只用一个入口：Web of Science。** 通过图书馆聚合服务的 CARSI 入口进 Web of Science，登录一次，之后每篇文献都在 WoS 里检索、点全文链接带着会话跳到出版商下载。不按出版商分组、不直连出版商。

> **批量更快更省 token**：下载多篇时用 `scripts/batch_download.mjs`，整条链路在 Node 内完成，只回传精简状态（10 篇约 50 秒）。例：`node scripts/batch_download.mjs --topic "rice blast resistance gene" --count 10 --out <项目目录>`。补充材料默认不下，加 `--si` 才下。

中文快速使用教程：

1. 先在自己的 Chrome 里打开交大图书馆，并用 jAccount 登录。
   - 图书馆主站：`https://www.lib.sjtu.edu.cn/`
   - 学术资源文献聚合访问服务（数据库一键直达入口）：图书馆站内的数据库导航页
2. 通过聚合服务点开你需要的库（如 Web of Science / ScienceDirect / Springer / IEEE / CNKI），确认能正常进入并看到全文。
3. 在 Chrome 地址栏打开 `chrome://inspect/#remote-debugging`，勾选 `Allow remote debugging for this browser instance`。
4. 告诉 Codex/Claude 你的文献清单，例如 DOI、题目或 PMID，并说明输出文件夹。
5. agent 会固定从 Web of Science 进，通过你已登录的 Chrome 会话检索、点全文链接、保存主文 PDF，并生成下载记录。**补充材料默认不下载**——需要时明确说“连补充材料一起下”。
6. 如果网页要求验证码、Cloudflare、人机验证、扫码、短信/OTP 或二次认证，需要你本人在 Chrome 里完成；agent 不绕过这些验证，也不自动点击出版商的人机验证。
7. 推荐小批量使用：一次 5-10 篇比较稳，最多 15-20 篇，并保留 manifest 记录。不要用它批量扫关键词结果、整期杂志或大量连续下载。
8. 如果 Claude Code 没有自动识别这个 skill，把仓库安装到 `%USERPROFILE%\.claude\skills\nature-downloader`，然后重启或刷新 Claude Code。
9. 如果遇到 jAccount / CARSI 统一身份认证，不要把账号密码发给 agent。若 Chrome 已经自动填好账号密码，你可以明确授权 agent 只点一次“登录/确认登录”；若出现扫码、短信/OTP、验证码、人机验证或安全提示，则需要你自己在 Chrome 里完成。若 CARSI 出现“选择机构”页面，选择 `Shanghai Jiao Tong University`。
10. 如果遇到 ScienceDirect 的 `Are you a robot?` 或其它出版商验证，让 agent 停在当前 tab，自己手动完成验证后再让 agent 从同一个页面继续。不要让 agent 反复刷新、随机点击或并发打开很多页。

可以这样对 agent 说：

```text
请使用 nature-downloader，通过我已经登录的交大图书馆（jAccount/CARSI）Chrome 会话，下载下面这些 DOI 的 PDF，并生成 manifest。（补充材料默认不下载；如需补充材料请加一句“连补充材料一起下”。）
```

## What It Solves

- SJTU Library can open a paper through CARSI, but direct `curl` or `Invoke-WebRequest` returns 403.
- A DOI/title list needs small-batch PDF and supporting information collection.
- jAccount/CARSI authentication interrupts a batch and the failed papers need to be retried after the user manually authenticates in Chrome.
- ScienceDirect or publisher verification interrupts a batch and needs manual browser handoff before retrying the same tab.
- The user wants a manifest recording DOI, source URL, download status, SI status, and local paths.
- PDFs need to be verified before an agent reads, summarizes, or cites them.
- Zotero can import metadata, but the user still wants local project-folder PDFs.

## First-run configuration

A few values depend on the live SJTU session and should be confirmed once, then locked into `SKILL.md`:

1. The exact SJTU CARSI IdP host (`idp.sjtu.edu.cn` is assumed — verify in the address bar at login).
2. The base URL / link pattern of the 学术资源文献聚合访问服务 entries for the publishers you actually use.
3. Whether a CARSI WAYF / 机构选择 step appears, and whether you authorize auto-selecting `Shanghai Jiao Tong University`.

See `SKILL.md` for the full workflow, boundaries, status categories, and failure handling.
