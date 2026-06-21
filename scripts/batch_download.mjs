#!/usr/bin/env node
// Batch literature downloader for the SJTU CARSI / Web of Science route.
//
// Runs the whole chain inside Node + the web-access CDP proxy, so large data
// (search DOMs, PDF bytes) never enters the agent's context. Only compact
// per-paper status is printed. This is the token-efficient fast path.
//
// Usage:
//   node batch_download.mjs --topic "<query>" --count 10 --out <dir> [--si]
//   node batch_download.mjs --dois 10.x/a,10.y/b --out <dir> [--si]
//   options: [--proxy http://127.0.0.1:3456] [--debug] [--legacy-status]
//
// Boundaries: uses only the user's already-authenticated browser session.
// Stops at jAccount / CARSI / CAPTCHA pages (reported as *_waiting_user), never
// handles credentials. Main PDF only by default; --si also fetches supplements.

import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_PROXY,
  healthCheck,
  evalJs,
  newTab,
  navigate,
  closeTab,
  listTargets,
  click,
  scroll,
  waitForComplete,
  proxyGet,
} from "./lib/cdp-utils.mjs";
import { classifyWall, STATUS, isSuccess, mapLegacyStatus } from "./lib/status-codes.mjs";
import { fetchToFile, fetchAnyToFile } from "./lib/pdf-utils.mjs";

// Core Collection only: journal articles that carry DOIs (avoids Derwent/patent records).
const WOS = "https://webofscience.clarivate.cn/wos/woscc/basic-search";

function parseArgs(argv) {
  const a = { count: 10, out: ".", si: false, proxy: DEFAULT_PROXY, debug: false, legacyStatus: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--topic") a.topic = argv[++i];
    else if (k === "--dois") a.dois = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--count") a.count = Number(argv[++i]);
    else if (k === "--out") a.out = argv[++i];
    else if (k === "--si") a.si = true;
    else if (k === "--proxy") a.proxy = argv[++i].replace(/\/$/, "");
    else if (k === "--debug") a.debug = true;
    else if (k === "--legacy-status") a.legacyStatus = true;
    else throw new Error("unknown arg " + k);
  }
  // --topic and --dois are mutually exclusive.
  if (a.topic && a.dois) {
    throw new Error("--topic and --dois are mutually exclusive");
  }
  return a;
}

// --- WoS: search a topic, return the first N full-record URLs ---
async function wosRecordUrls(proxy, topic, count, debug) {
  const tabs = await listTargets(proxy);
  let target = (tabs.find((t) => /webofscience\./i.test(t.url || "")) || {}).targetId;
  if (target) await navigate(proxy, target, WOS);
  else target = (await newTab(proxy, WOS)).targetId;
  await waitForComplete(proxy, target);
  await new Promise((r) => setTimeout(r, 1500));
  await evalJs(
    proxy,
    target,
    `(()=>{const a=document.querySelector('#onetrust-accept-btn-handler');if(a)a.click();return 1;})()`
  ).catch(() => {});
  await evalJs(
    proxy,
    target,
    `(()=>{const i=document.querySelector('#search-option-0');if(!i)return 0;const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify(topic)});i.dispatchEvent(new Event('input',{bubbles:true}));return 1;})()`
  );
  await click(proxy, target, 'button[data-ta="run-search"]');
  // WoS renders records in shadow DOM + a virtualized list, so we walk shadow roots
  // and scroll to load more rows until we have enough record links.
  const collect = `(()=>{const out=new Set();(function w(r){r.querySelectorAll('*').forEach(e=>{if(e.shadowRoot)w(e.shadowRoot);if(e.tagName==='A'&&/\\/full-record\\//.test(e.href||''))out.add(e.href);});})(document);return JSON.stringify([...out]);})()`;
  let urls = [];
  let lastInfo = null;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const inf = await proxyGet(proxy, "/info", { target }, 8000).catch(() => ({}));
    lastInfo = inf;
    if (!/\/summary\//.test(inf.url || "")) continue;
    const found = JSON.parse((await evalJs(proxy, target, collect)) || "[]");
    if (found.length > urls.length) urls = found;
    if (urls.length >= count * 2) break;
    await scroll(proxy, target, "bottom");
  }
  if (debug && urls.length === 0) {
    const html = await evalJs(
      proxy,
      target,
      `document.documentElement.outerHTML.slice(0,5000)`
    ).catch(() => "");
    process.stderr.write(`[debug][wos] no records found. url=${lastInfo?.url||'?'} title=${lastInfo?.title||'?'}\n`);
    process.stderr.write(`[debug][wos] html snippet: ${html.slice(0, 500)}\n`);
  }
  return { target, urls: urls.slice(0, count * 3) };
}

// --- From a WoS full-record page, get the article DOI ---
async function doiFromRecord(proxy, target, recordUrl) {
  await navigate(proxy, target, recordUrl);
  await waitForComplete(proxy, target);
  await new Promise((r) => setTimeout(r, 1200));
  const doi = await evalJs(
    proxy,
    target,
    `(()=>{let h='';(function w(r){r.querySelectorAll('*').forEach(e=>{if(e.shadowRoot)w(e.shadowRoot);if(!h&&e.tagName==='A'&&/doi\\.org\\/10\\./.test(e.href||''))h=e.href;});})(document);if(h)return (h.match(/10\\.\\d{4,9}\\/[^\\s"?]+/)||[])[0];const m=(document.body.innerText||'').match(/10\\.\\d{4,9}\\/[^\\s"]+/);return m?m[0]:'';})()`
  );
  return (doi || "").replace(/[.,;]+$/, "");
}

// --- Download main PDF (and optionally SI) for a DOI via the authenticated browser ---
async function downloadDoi(proxy, doi, outDir, wantSi, debug) {
  const tab = (await newTab(proxy, "https://doi.org/" + doi)).targetId;
  try {
    const info = await waitForComplete(proxy, tab);
    const wall = classifyWall(info.url || "", info.title || "");
    if (wall) return { doi, status: wall.status, url: info.url, reason: wall.reason };
    // poll: publisher landings often JS-redirect (e.g. linkinghub -> sciencedirect)
    // and inject citation_pdf_url late; re-read a few times before giving up.
    let meta = {};
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 1200));
      meta = JSON.parse(
        (await evalJs(
          proxy,
          tab,
          `(()=>{
        const m=document.querySelector('meta[name=citation_pdf_url]');
        const cand=[]; if(m&&m.content)cand.push(m.content);
        document.querySelectorAll('a').forEach(a=>{const h=a.href||'';if(/\\/pdf|pdfdirect|pdfft|\\.pdf(\\?|$)|\\/doi\\/epdf/i.test(h))cand.push(h);});
        return JSON.stringify({cand:[...new Set(cand)].slice(0,6),title:document.title||'',url:location.href,body:(document.body.innerText||'').slice(0,160)});
      })()`
        )) || "{}"
      );
      const w = classifyWall(meta.url || "", meta.title || "", meta.body || "");
      if (w) return { doi, status: w.status, url: meta.url, reason: w.reason };
      if (meta.cand && meta.cand.length) break;
    }
    // Publisher quirk: Wiley's citation_pdf_url/epdf opens a viewer, not raw bytes.
    // The pdfdirect?download=true endpoint returns the actual PDF in the same session.
    if (/wiley\.com/i.test(meta.url || "") || (meta.cand || []).some((c) => /wiley\.com/i.test(c))) {
      meta.cand = [
        `https://onlinelibrary.wiley.com/doi/pdfdirect/${doi}?download=true`,
        ...(meta.cand || []),
      ];
    }
    // Distinguish WoS-stage "no record" from publisher-stage "no PDF":
    // if we got here, WoS found the record (we have a doi.org redirect to a
    // publisher page), so "no PDF candidates" means no_authorized_pdf_found.
    if (!meta.cand || !meta.cand.length) {
      if (debug) {
        process.stderr.write(
          `[debug][doi] ${doi} no PDF candidates. url=${meta.url||'?'} title=${meta.title||'?'}\n`
        );
      }
      return { doi, status: STATUS.NO_AUTHORIZED_PDF_FOUND, url: meta.url };
    }

    const safe = doi.replace(/[\/:*?"<>|]/g, "_");
    for (const pdfUrl of meta.cand) {
      const got = await fetchToFile(proxy, tab, pdfUrl, path.join(outDir, "PDFs", safe + ".pdf"));
      if (got.ok) {
        const res = {
          doi,
          status: STATUS.DOWNLOADED,
          file: got.file,
          bytes: got.bytes,
          via: meta.url,
        };
        if (wantSi) {
          const si = await downloadSi(proxy, tab, meta.url, doi, outDir);
          res.si = si;
          if (si && si.count > 0) res.status = STATUS.DOWNLOADED_WITH_SI;
        }
        return res;
      }
    }
    return { doi, status: STATUS.PDF_FETCH_FAILED, url: meta.url };
  } finally {
    await closeTab(proxy, tab);
  }
}

async function downloadSi(proxy, tab, landingUrl, doi, outDir) {
  // Best-effort: scan landing page for supplement links, download each.
  await navigate(proxy, tab, landingUrl);
  await waitForComplete(proxy, tab);
  await new Promise((r) => setTimeout(r, 800));
  const links = JSON.parse(
    (await evalJs(
      proxy,
      tab,
      `JSON.stringify([...new Set(Array.from(document.querySelectorAll('a')).map(a=>a.href).filter(h=>/downloadSupplement|\\/suppl|supplementary|mmc\\d|_si_/i.test(h)))].slice(0,30))`
    )) || "[]"
  );
  const safe = doi.replace(/[\/:*?"<>|]/g, "_");
  let n = 0;
  for (const u of links) {
    const name = (u.split("file=")[1] || u.split("/").pop() || "si" + ++n)
      .replace(/[\/:*?"<>|]/g, "_")
      .slice(0, 80);
    const got = await fetchAnyToFile(
      proxy,
      tab,
      u,
      path.join(outDir, "SupportingInformation", safe + "__" + name)
    );
    if (got.ok) n++;
  }
  return { count: n, found: links.length };
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.out, { recursive: true });

  // Fail fast with a friendly message if the CDP proxy isn't running.
  await healthCheck(args.proxy);

  let dois = args.dois || [];

  if (!dois.length && args.topic) {
    process.stderr.write(`[wos] searching: ${args.topic}\n`);
    const { target, urls } = await wosRecordUrls(args.proxy, args.topic, args.count, args.debug);
    process.stderr.write(`[wos] ${urls.length} records\n`);
    for (const u of urls) {
      if (dois.length >= args.count) break;
      const doi = await doiFromRecord(args.proxy, target, u);
      if (doi && /^10\./.test(doi)) {
        dois.push(doi);
        process.stderr.write(`[doi] ${doi}\n`);
      }
    }
  }
  dois = [...new Set(dois)].slice(0, args.count);

  const results = [];
  const t0 = Date.now();
  for (const doi of dois) {
    const r = await downloadDoi(args.proxy, doi, args.out, args.si, args.debug).catch((e) => {
      // Distinguish parameter/logic errors (do_not_auto_retry) from
      // network/CDP errors (failed_after_retry).
      const msg = String(e).slice(0, 120);
      const isLogic = /unknown arg|mutually exclusive|required|not reachable/i.test(msg);
      return {
        doi,
        status: isLogic ? STATUS.DO_NOT_AUTO_RETRY : STATUS.FAILED_AFTER_RETRY,
        err: msg,
      };
    });
    // Apply legacy status mapping for backward-compatible output if requested.
    if (args.legacyStatus) {
      r.status = reverseMapStatus(r.status);
    }
    results.push(r);
    process.stderr.write(
      `[dl] ${doi} -> ${r.status}${r.bytes ? " " + r.bytes + "B" : ""}\n`
    );
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = results.filter((r) => isSuccess(r.status)).length;
  console.log(
    JSON.stringify(
      { summary: { total: dois.length, downloaded: ok, seconds: Number(secs) }, results },
      null,
      2
    )
  );
}

// Reverse mapping: canonical -> legacy (only for --legacy-status output).
// Best-effort; some canonical codes have no legacy equivalent and pass through.
function reverseMapStatus(s) {
  const m = {
    [STATUS.CARSI_WAITING_USER]: "needs_user_login",
    [STATUS.PUBLISHER_VERIFICATION_WAITING_USER]: "needs_user_verify",
    [STATUS.SCIENCEDIRECT_ROBOT_CHECK]: "needs_user_verify",
    [STATUS.PUBLISHER_BLOCKED_WAITING_USER]: "publisher_blocked",
    [STATUS.NO_FULL_TEXT_LINK]: "no_pdf_link",
    [STATUS.NO_AUTHORIZED_PDF_FOUND]: "no_pdf_link",
    [STATUS.FAILED_AFTER_RETRY]: "error",
    [STATUS.DO_NOT_AUTO_RETRY]: "error",
  };
  return m[s] || s;
}

main().catch((e) => {
  console.error(e.stack || String(e));
  process.exit(1);
});
