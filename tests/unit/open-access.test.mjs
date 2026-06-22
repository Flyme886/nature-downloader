import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  arxivPdfUrl,
  exactTitleMatch,
  filenameForPdfUrl,
  normalizeArxivId,
  parseArxivAtom,
} from "../../scripts/lib/open-access.mjs";

describe("open access helpers", () => {
  test("normalizes arXiv ids from ids and URLs", () => {
    assert.equal(normalizeArxivId("1706.03762"), "1706.03762");
    assert.equal(normalizeArxivId("1706.03762v7"), "1706.03762v7");
    assert.equal(normalizeArxivId("https://arxiv.org/abs/1706.03762"), "1706.03762");
    assert.equal(normalizeArxivId("https://arxiv.org/pdf/1706.03762.pdf"), "1706.03762");
  });

  test("builds canonical arXiv PDF URL", () => {
    assert.equal(arxivPdfUrl("1706.03762"), "https://arxiv.org/pdf/1706.03762");
  });

  test("matches exact titles with whitespace and case tolerance", () => {
    assert.equal(exactTitleMatch("Attention Is All You Need", "attention is all you need"), true);
    assert.equal(exactTitleMatch("Attention\nIs   All You Need", "Attention Is All You Need"), true);
    assert.equal(exactTitleMatch("Getting the attention you need", "Attention Is All You Need"), false);
  });

  test("parses exact arXiv Atom result", () => {
    const xml = `<?xml version="1.0"?>
      <feed>
        <entry>
          <id>http://arxiv.org/abs/1706.03762v7</id>
          <title>Attention Is All You Need</title>
        </entry>
        <entry>
          <id>http://arxiv.org/abs/0000.00000</id>
          <title>Getting the attention you need</title>
        </entry>
      </feed>`;
    assert.deepEqual(parseArxivAtom(xml, "Attention Is All You Need"), {
      id: "1706.03762v7",
      title: "Attention Is All You Need",
      pdfUrl: "https://arxiv.org/pdf/1706.03762v7",
    });
  });

  test("creates readable PDF filenames", () => {
    assert.equal(
      filenameForPdfUrl("https://arxiv.org/pdf/1706.03762", "Attention Is All You Need"),
      "Attention_Is_All_You_Need.pdf"
    );
    assert.equal(
      filenameForPdfUrl("https://example.org/papers/a/b/c.pdf"),
      "c.pdf"
    );
  });
});
