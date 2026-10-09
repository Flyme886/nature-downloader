<div align="center">

<a href="README.md">中文</a> · <a id="english"></a>English

<h1>📚 nature-downloader</h1>

<p><strong>Turn lawful full-text retrieval into one clear command.</strong></p>

<hr>

<p>
  <a href="https://github.com/Flyme886/nature-downloader/blob/main/LICENSE"><img src="https://img.shields.io/badge/LICENSE-MIT-4e80ee?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/NODE.JS-22%2B-55b685?style=flat-square" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/PYTHON-3.x-845eee?style=flat-square" alt="Python 3">
  <a href="SKILL.md"><img src="https://img.shields.io/badge/AGENT%20SKILLS-COMPATIBLE-cc7c2e?style=flat-square" alt="Agent Skills compatible"></a>
</p>

</div>

<p align="center"><strong>Routes each paper through CNKI, publisher APIs, legitimate OA sources, or institutional access based on language, publisher, and available credentials.</strong></p>

<p align="center">Downloads full text and Supporting Information (SI) in batches, with an evidence-rich manifest for every result.</p>

---

## Quick start

### 1. Install

Requires Node.js 22+, Python 3, and the Python dependencies:

~~~bash
git clone https://github.com/Flyme886/nature-downloader.git
cd nature-downloader
python3 -m pip install -r requirements.txt
~~~

The entry point is <code>scripts/batch_download.mjs</code>; there is no npm package to install.

### 2. Choose SI explicitly

Every download must include exactly one of:

| Flag | Meaning |
| --- | --- |
| <code>--no-si</code> | Main text only |
| <code>--si</code> | Main text plus available Supporting Information |

Without either flag, the command returns <code>si_confirmation_required</code> and creates no output directory.

### 3. Download

~~~bash
# DOI batch
node scripts/batch_download.mjs \
  --dois "10.1007/s00122-021-03957-1,10.1111/pbi.14066" \
  --no-si \
  --out "./literature-downloads"

# Open-access title
node scripts/batch_download.mjs \
  --title "Attention Is All You Need" \
  --open-access \
  --no-si \
  --out "./literature-downloads"

# Topic search with SI
node scripts/batch_download.mjs \
  --topic "rice blast resistance gene" \
  --count 10 \
  --si \
  --out "./literature-downloads"
~~~

## Routing matrix

| Paper type | Route | Required access |
| --- | --- | --- |
| Chinese literature | CNKI institutional access | Your library entry and an authenticated Chrome session |
| Elsevier, Springer Nature, IEEE | Publisher API → legal OA → Web Access after confirmation | Provider API key; institutional session for Web Access |
| Other English publishers | Legal OA → institutional Web Access | Public OA link or authenticated session |
| Known legal full-text URL | Direct download with format validation | PDF/full-text URL |

The project never bypasses paywalls, DRM, CAPTCHA, or two-factor authentication.

## Configuration

Save the library entry you actually use:

~~~bash
python3 scripts/configure_school.py infer "https://example.edu/library/resources"
python3 scripts/configure_school.py url "https://example.edu/library/resources"
python3 scripts/configure_school.py show
python3 scripts/configure_school.py health --force
~~~

Configure publisher credentials only when needed:

- [Elsevier Developer Portal](https://dev.elsevier.com/)
- [Springer Nature API Access](https://dev.springernature.com/docs/quick-start/api-access/)
- [IEEE Developer Registration](https://developer.ieee.org/member/register)

~~~bash
python3 scripts/configure_credentials.py set elsevier
python3 scripts/configure_credentials.py set springer_nature
python3 scripts/configure_credentials.py set ieee --fulltext-endpoint "https://issued-endpoint.example/articles/{doi}"
python3 scripts/configure_credentials.py show
~~~

Credentials are stored in <code>~/.config/lit-dl/credentials.json</code> with mode <code>0600</code>; displays show only the last four characters. Unpaywall also needs a contact email:

~~~bash
python3 scripts/configure_credentials.py contact-email researcher@example.org
~~~

## Output

~~~text
literature-downloads/
├── PDFs/
├── FullText/
├── CNKI/
├── SupportingInformation/
└── manifest.json
~~~

The manifest records normalized DOI, language, publisher, route, OA evidence, access mode, format, MIME type, size, SHA-256, SI choice, and failure reason. API keys, tokens, cookies, and similar secrets are removed recursively.

## Safety boundaries

- Chinese literature and explicit CNKI sources always use the CNKI route.
- Browser cookies, passwords, localStorage, and session files are never exported.
- Login pages, HTML, and CAJ are never mislabeled as PDF; PDF responses are checked for a real <code>%PDF</code> header.
- If an API has no entitlement, legitimate OA sources are checked before Web Access is offered.
- Unknown OA status is recorded as <code>unknown</code>, not incorrectly treated as closed access.

## Verification

~~~bash
python3 -m unittest discover -s tests/python
node --test tests/unit/*.test.mjs
node --check scripts/batch_download.mjs
node --check scripts/browser_pdf_downloader.mjs
~~~

See [SKILL.md](SKILL.md) for the full Agent workflow, [examples](examples/) for sample inputs, and [docs](docs/) for design notes.

Released under the [MIT License](LICENSE).
