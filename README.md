<div align="center">

<a id="中文"></a>
中文 · <a href="README.en.md">English</a>

<h1>📚 nature-downloader</h1>

<p><strong>通过学校图书馆资源全自动下载文献 爽！</strong></p>

<hr>

<p>
  <a href="https://github.com/Flyme886/nature-downloader/blob/main/LICENSE"><img src="https://img.shields.io/badge/LICENSE-MIT-4e80ee?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/NODE.JS-22%2B-55b685?style=flat-square" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/PYTHON-3.x-845eee?style=flat-square" alt="Python 3">
  <a href="SKILL.md"><img src="https://img.shields.io/badge/AGENT%20SKILLS-COMPATIBLE-cc7c2e?style=flat-square" alt="Agent Skills compatible"></a>
</p>

</div>

<p align="center"><strong>按文献语言、出版商和可用凭据，自动选择 CNKI、出版商 API、合法开放获取或机构授权路线。</strong></p>

<p align="center">支持正文与 Supporting Information（SI）批量下载，并用 manifest 记录来源、访问模式、格式、校验值和失败原因。</p>

---

## 你能用它做什么

| 场景 | 默认路线 | 需要什么 |
| --- | --- | --- |
| 中文文献 | CNKI 机构授权 | 学校/单位图书馆入口与已登录的 Chrome 会话 |
| Elsevier、Springer Nature、IEEE | 出版商 API → 合法 OA → 询问后再走 Web Access | 对应 API Key；Web Access 需要机构会话 |
| 其他英文文献 | 合法 OA → Web Access 机构授权 | OA 公开链接或已登录的机构会话 |
| 已知合法全文 URL | 直接下载并校验格式 | PDF/全文 URL |

项目只使用用户有权访问的资源，不绕过付费墙、DRM、验证码或双重认证。

## 快速开始

### 1. 安装运行环境

需要 Node.js 22+、Python 3 和 Python 依赖：

~~~bash
git clone https://github.com/Flyme886/nature-downloader.git
cd nature-downloader

python3 -m pip install -r requirements.txt

node --version
python3 --version
~~~

仓库没有 npm package；下载入口是 <code>scripts/batch_download.mjs</code>。

### 2. 明确是否下载 SI

每一次下载都必须显式选择一次，整个批次共用这个选择：

| 参数 | 含义 |
| --- | --- |
| <code>--no-si</code> | 只下载正文 |
| <code>--si</code> | 下载正文和能找到的 Supporting Information |

两个参数都不提供会返回 <code>si_confirmation_required</code>，且不会创建输出目录；同时提供会直接报参数错误。

### 3. 下载一篇或一批文献

~~~bash
# DOI 批量下载
node scripts/batch_download.mjs \
  --dois "10.1007/s00122-021-03957-1,10.1111/pbi.14066" \
  --no-si \
  --out "./文献自动下载"

# 英文题名：只查合法 OA
node scripts/batch_download.mjs \
  --title "Attention Is All You Need" \
  --open-access \
  --no-si \
  --out "./文献自动下载"

# 主题检索并下载 SI
node scripts/batch_download.mjs \
  --topic "rice blast resistance gene" \
  --count 10 \
  --si \
  --out "./文献自动下载"
~~~

默认优先 PDF，也允许 CNKI CAJ。只接受 PDF 时加上 <code>--cnki-format pdf</code>；学校提供专用知网入口时加上 <code>--cnki-url URL</code>。

## 配置（按需）

### 图书馆与 CNKI

先保存你实际使用的图书馆资源入口，不要猜学校域名：

~~~bash
python3 scripts/configure_school.py infer "https://example.edu/library/resources"
python3 scripts/configure_school.py url "https://example.edu/library/resources"
python3 scripts/configure_school.py show
python3 scripts/configure_school.py health --force
~~~

配置默认保存在 <code>~/.config/lit-dl/school.json</code>。CNKI 和 Web Access 会复用用户已登录的 Chrome 机构会话；登录、扫码、OTP 和复杂验证由用户本人完成。

### 出版商 API

只有对应文章属于相关出版商且确实需要时才配置：

- [Elsevier Developer Portal](https://dev.elsevier.com/)
- [Springer Nature API Access](https://dev.springernature.com/docs/quick-start/api-access/)
- [IEEE Developer Registration](https://developer.ieee.org/member/register)

~~~bash
# 隐藏输入保存 API Key
python3 scripts/configure_credentials.py set elsevier
python3 scripts/configure_credentials.py set springer_nature
python3 scripts/configure_credentials.py set ieee \
  --fulltext-endpoint "https://issued-endpoint.example/articles/{doi}"

# 查看或校验配置
python3 scripts/configure_credentials.py show
python3 scripts/configure_credentials.py validate elsevier

# 删除配置
python3 scripts/configure_credentials.py delete elsevier
~~~

API Key 保存在 <code>~/.config/lit-dl/credentials.json</code>，权限为 <code>0600</code>，展示时只显示末四位。主动提供 Key 后，也可以通过标准输入安全保存：

~~~bash
python3 scripts/configure_credentials.py set elsevier --stdin
~~~

Unpaywall 查询需要合规联系邮箱：

~~~bash
python3 scripts/configure_credentials.py contact-email researcher@example.org
~~~

## 常用输入

| 参数 | 用途 |
| --- | --- |
| <code>--doi</code> / <code>--dois</code> | 按 DOI 下载 |
| <code>--title</code> | 按题名下载 |
| <code>--topic</code> + <code>--count</code> | 主题检索并批量下载 |
| <code>--pdf-url</code> | 从已知合法全文 URL 下载 |
| <code>--language zh|en</code> | 元数据冲突时覆盖语言判断 |
| <code>--route cnki|open_access|elsevier|springer_nature|ieee|web_access</code> | 覆盖路由 |
| <code>--out</code> | 指定输出目录 |
| <code>--si</code> / <code>--no-si</code> | 选择是否下载 SI |

API 无全文权限时，程序会先检查 PMC、Unpaywall、出版商 OA 和合法仓储。只有 API 与 OA 都没有拿到全文，才会返回 <code>api_fallback_confirmation_required</code>。确认后可按出版商重试：

~~~bash
--api-fallback-web-for elsevier
--no-api-fallback-web-for springer_nature
~~~

也可以对整个批次使用 <code>--api-fallback-web</code> 或 <code>--no-api-fallback-web</code>。

## 输出结果

~~~text
文献自动下载/
├── PDFs/
├── FullText/
├── CNKI/
├── SupportingInformation/
└── manifest.json
~~~

<code>manifest.json</code> 会记录规范 DOI、语言、出版商、路由、OA 证据、访问模式、正文格式、MIME、文件大小、SHA-256、SI 选择和失败原因，并递归移除 API Key、Token、Cookie 等秘密字段。

正文结果可能标记为：

- <code>downloaded</code> / <code>open_access_downloaded</code>
- <code>native_fulltext_downloaded</code>
- <code>full_text_html_available</code>
- <code>downloaded_with_si</code>

## 合法性与安全边界

- 中文文献、中文元数据或明确的 CNKI URL 始终走 CNKI。
- 不读取或导出浏览器 Cookie、密码、localStorage 或 session 文件。
- 不把登录页、HTML 或 CAJ 冒充 PDF；PDF 下载会校验真实 <code>%PDF</code> 响应。
- 机构授权失败时，先确认当前浏览器是否复用了用户已登录的配置文件。
- OA 状态无法确认时记录为 <code>unknown</code>，不会误标为非 OA。

## 验证

~~~bash
python3 -m unittest discover -s tests/python
node --test tests/unit/*.test.mjs
node --check scripts/batch_download.mjs
node --check scripts/browser_pdf_downloader.mjs
~~~

## 目录

| 路径 | 作用 |
| --- | --- |
| <code>scripts/</code> | 批量下载、配置、CNKI 和浏览器访问入口 |
| <code>src/</code> | Python 配置、健康检查和向导模块 |
| <code>tests/</code> | Python 与 Node.js 测试 |
| <code>examples/</code> | 可直接参考的输入示例 |
| <code>SKILL.md</code> | 面向 Agent 的完整工作流与安全约束 |
| <code>docs/</code> | 设计说明与研究记录 |

## 贡献与许可

欢迎通过 [Issue](https://github.com/Flyme886/nature-downloader/issues) 提交问题或建议，也欢迎提交 Pull Request。请在改动后运行上面的验证命令，并在 PR 中说明测试结果。

本项目以 [MIT License](LICENSE) 发布。
