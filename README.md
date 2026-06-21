# nature-downloader

nature- skill 系列构筑了一条完整的学术研究链路——检索、阅读、引用、润色、写作、审稿回复、图表、数据，再到汇报和专利转化，覆盖科研工作者从读到写的全流程，专业度高、边界清晰。

但痛点是，nature- 系列唯独解决不了真实 PDF 下载的问题。出版商付费墙、机构认证、人机验证拦在前面——nature-academic-search 能找到题目和摘要，却下不到全文；nature-reader 能解读 PDF，却拿不到 PDF 本体。用户明明在自己的图书馆里能看到全文，却无法在 agent 里自动拿到那份 PDF。每次都得切回浏览器手动下载，再拖进对话框，整个 nature- 工作流的自动化在这一步断掉。

nature-downloader 的必要性正在于此：它不绕付费墙、不用镜像站、不碰灰色资源——它唯一做的事，就是帮你把你本校图书馆已经合法购买了访问权、你本人已经通过统一身份认证登录了的那份 PDF，自动送到你的项目文件夹里。你用 jAccount 登一次、Chrome 开着，剩下的检索→跳转出版商→保存验证→记录 manifest，全部在你有权访问的文献范围内完成。你的学号，就是你的钥匙。

---

## 快速使用

1. 在 Chrome 里打开交大图书馆（`https://www.lib.sjtu.edu.cn/`），用 jAccount 登录。
2. 通过学术资源文献聚合访问服务进入 Web of Science 等数据库，确认能正常看到全文。
3. 在 Chrome 地址栏打开 `chrome://inspect/#remote-debugging`，开启远程调试。
4. 告诉 agent 你的文献清单（DOI、题目），指定输出文件夹。
5. agent 从 Web of Science 检索、点全文链接、保存 PDF，生成下载记录。**补充材料默认不下载**，需明确说"连补充材料一起下"。
6. 遇到验证码、Cloudflare、人机验证、扫码、短信/OTP，需你本人在 Chrome 里完成；agent 不绕过这些验证。

推荐小批量使用：一次 5-10 篇，最多 15-20 篇。批量下载用 `scripts/batch_download.mjs`（10 篇约 50 秒）。

可以这样对 agent 说：

```text
请使用 nature-downloader，通过我已经登录的交大图书馆（jAccount/CARSI）Chrome 会话，下载下面这些 DOI 的 PDF，并生成 manifest。
```

## What It Solves

- 交大图书馆通过 CARSI 能打开论文，但 `curl` 直接下载返回 403。
- 需要小批量下载 PDF 和补充材料。
- jAccount/CARSI 认证中断后，需要手动登录再继续。
- ScienceDirect 或出版商验证阻断后，需要手动处理再续跑。
- 需要 manifest 记录 DOI、下载状态、本地路径。
- PDF 下载后需验证（`%PDF` 签名、页数、文本可读性）再交给 agent 阅读。

## First-run configuration

1. 确认 SJTU CARSI IdP 地址（通常为 `idp.sjtu.edu.cn`，登录时查看地址栏确认）。
2. 确认学术资源文献聚合访问服务中各数据库的入口链接。
3. 若 CARSI 出现机构选择页，选择 `Shanghai Jiao Tong University`。

详见 `SKILL.md` 了解完整工作流、安全边界、状态码体系和失败处理。
