import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPublisher,
  chooseRoute,
  parseSiChoice,
} from "../../scripts/lib/routing.mjs";

describe("SI confirmation gate", () => {
  test("requires one explicit SI choice before downloading", () => {
    assert.deepEqual(parseSiChoice({ si: false, noSi: false }), {
      confirmed: false,
      status: "si_confirmation_required",
    });
    assert.deepEqual(parseSiChoice({ si: true, noSi: false }), {
      confirmed: true,
      wantSi: true,
    });
    assert.deepEqual(parseSiChoice({ si: false, noSi: true }), {
      confirmed: true,
      wantSi: false,
    });
    assert.throws(() => parseSiChoice({ si: true, noSi: true }), /mutually exclusive/i);
  });
});

describe("literature routing", () => {
  test("routes every Chinese article only to CNKI", () => {
    assert.equal(chooseRoute({ title: "乡村振兴研究", isOa: true, publisher: "Elsevier" }).provider, "cnki");
    assert.equal(chooseRoute({ language: "zh", doi: "10.1016/example", isOa: false }).provider, "cnki");
    assert.equal(chooseRoute({ sourceUrl: "https://kns.cnki.net/kcms/detail/detail.aspx?filename=x" }).provider, "cnki");
  });

  test("routes English OA articles before publisher classification", () => {
    assert.equal(chooseRoute({ language: "en", isOa: true, publisher: "Elsevier" }).provider, "open_access");
  });

  test("routes English non-OA articles by publisher", () => {
    assert.equal(chooseRoute({ language: "en", isOa: false, publisher: "Elsevier" }).provider, "elsevier");
    assert.equal(chooseRoute({ language: "en", isOa: false, publisher: "Springer Nature" }).provider, "springer_nature");
    assert.equal(chooseRoute({ language: "en", isOa: false, publisher: "IEEE" }).provider, "ieee");
    assert.equal(chooseRoute({ language: "en", isOa: false, publisher: "Wiley" }).provider, "web_access");
  });

  test("recognizes publisher from DOI prefixes and names", () => {
    assert.equal(classifyPublisher({ doi: "10.1016/j.cell.2026.01.001" }), "elsevier");
    assert.equal(classifyPublisher({ doi: "10.1007/s00122-021-03957-1" }), "springer_nature");
    assert.equal(classifyPublisher({ doi: "10.1109/5.771073" }), "ieee");
    assert.equal(classifyPublisher({ publisher: "Elsevier B.V." }), "elsevier");
  });
});
