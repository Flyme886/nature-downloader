import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CNKI_URL,
  cnkiSearchUrl,
  filterCnkiDownloadCandidates,
  isCnkiUrl,
  looksChinese,
  safeCnkiFileName,
} from "../../scripts/lib/cnki.mjs";

describe("CNKI helpers", () => {
  test("detects Chinese titles", () => {
    assert.equal(looksChinese("乡村振兴背景下数字治理研究"), true);
    assert.equal(looksChinese("Digital governance in rural China"), false);
  });

  test("builds a CNKI search URL with kw", () => {
    const url = new URL(cnkiSearchUrl("乡村振兴", DEFAULT_CNKI_URL));
    assert.equal(url.hostname, "kns.cnki.net");
    assert.equal(url.searchParams.get("kw"), "乡村振兴");
  });

  test("recognizes CNKI hosts", () => {
    assert.equal(isCnkiUrl("https://kns.cnki.net/kcms/detail/detail.aspx"), true);
    assert.equal(isCnkiUrl("https://navi.cnki.com.cn/knavi/"), true);
    assert.equal(isCnkiUrl("https://example.org/paper"), false);
  });

  test("creates safe CNKI filenames", () => {
    assert.equal(
      safeCnkiFileName("乡村振兴: 数字治理/路径?", ".pdf"),
      "乡村振兴_数字治理路径.pdf"
    );
    assert.equal(safeCnkiFileName("", ".caj"), "cnki-paper.caj");
  });

  test("filters CNKI candidates to PDF-only when requested", () => {
    const candidates = [
      { text: "下载", url: "https://kns.cnki.net/kcms/download.aspx?filename=abc" },
      { text: "PDF下载", url: "https://kns.cnki.net/kcms/download.aspx?filename=abc&dflag=pdf" },
      { text: "CAJ下载", url: "https://kns.cnki.net/kcms/download.aspx?filename=abc&dflag=caj" },
    ];
    assert.deepEqual(filterCnkiDownloadCandidates(candidates, "pdf"), [candidates[1]]);
    assert.deepEqual(filterCnkiDownloadCandidates(candidates, "any"), candidates);
  });
});
