import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../scripts/batch_download.mjs";

describe("batch CLI contract", () => {
  test("does not create an output directory before SI is confirmed", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "si-gate-"));
    const out = path.join(parent, "must-not-exist");
    const script = fileURLToPath(new URL("../../scripts/batch_download.mjs", import.meta.url));
    const run = spawnSync(process.execPath, [script, "--title", "Example", "--out", out], { encoding: "utf8" });
    assert.equal(run.status, 2);
    assert.match(run.stdout, /si_confirmation_required/);
    assert.equal(fs.existsSync(out), false);
  });

  test("rejects conflicting SI choices", () => {
    assert.throws(
      () => parseArgs(["node", "batch_download.mjs", "--title", "Example", "--si", "--no-si"]),
      /mutually exclusive/i
    );
  });

  test("accepts publisher-scoped web fallback decisions", () => {
    const args = parseArgs([
      "node", "batch_download.mjs", "--dois", "10.1016/example", "--no-si",
      "--api-fallback-web-for", "elsevier,ieee",
      "--no-api-fallback-web-for", "springer_nature",
    ]);
    assert.deepEqual(args.apiFallbackWebFor, ["elsevier", "ieee"]);
    assert.deepEqual(args.noApiFallbackWebFor, ["springer_nature"]);
  });

  test("accepts a title alongside a known PDF URL", () => {
    const args = parseArgs([
      "node", "batch_download.mjs",
      "--pdf-url", "https://example.org/paper.pdf",
      "--title", "Example Paper",
      "--no-si",
    ]);
    assert.equal(args.pdfUrl, "https://example.org/paper.pdf");
    assert.equal(args.title, "Example Paper");
  });
});
