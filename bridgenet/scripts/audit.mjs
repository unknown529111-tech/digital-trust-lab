/* BridgeNet automated accessibility audit (CI gate).
   Runs axe-core against:
     1. the static (no-JS) DOM — the fallback experience
     2. the post-JS English DOM — default experience
     3. the post-JS Arabic (RTL) DOM — after clicking the language toggle
   Fails the build on any wcag2a/2aa/21a/21aa/22aa violation.
   Note: color-contrast requires real rendering; jsdom marks it "incomplete" —
   real-browser contrast verification is done separately (docs/WCAG-COMPLIANCE.md). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import axe from "axe-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const url = "file://" + path.join(root, "index.html").replace(/\\/g, "/");

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function makeDom(runScripts) {
  const dom = new JSDOM(html, {
    url,
    runScripts: runScripts ? "dangerously" : "outside-only",
    resources: runScripts ? "usable" : undefined,
    pretendToBeVisual: true,
    virtualConsole: new (await import("jsdom")).VirtualConsole().sendTo(console, { omitJSDOMErrors: true }),
  });
  await new Promise((resolve) => dom.window.addEventListener("load", resolve));
  if (runScripts) await delay(1200); // let defer scripts + filters settle
  return dom;
}

async function audit(dom, label) {
  const { window } = dom;
  window.eval(axe.source);
  const results = await window.axe.run(window.document, {
    runOnly: { type: "tag", values: TAGS },
    resultTypes: ["violations", "incomplete"],
  });
  const violations = results.violations;
  console.log(`\n--- ${label} ---`);
  console.log(`violations: ${violations.length}, incomplete: ${results.incomplete.length}`);
  let failed = false;
  for (const v of violations) {
    failed = true;
    console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
    for (const n of v.nodes.slice(0, 4)) console.log(`      -> ${n.target.join(" ")}`);
  }
  for (const inc of results.incomplete) {
    console.log(`  (incomplete) ${inc.id}: ${inc.help}`);
  }
  return failed;
}

let exitCode = 0;

// 1. Static, no-JS DOM
{
  const dom = await makeDom(false);
  const bad = await audit(dom, "Static (no JS)");
  const lang = dom.window.document.documentElement.getAttribute("lang");
  console.log(`  lang=${lang}`);
  if (lang !== "en" || bad) exitCode = 1;
  dom.window.close();
}

// 2. Post-JS English DOM
{
  const dom = await makeDom(true);
  const { window } = dom;
  const bad = await audit(dom, "JavaScript rendered (English)");
  const cards = window.document.querySelectorAll("article.card").length;
  console.log(`  article cards=${cards}, lang=${window.document.documentElement.lang}`);
  if (bad || cards < 6) exitCode = 1;
  dom.window.close();
}

// 3. Post-JS Arabic (RTL) DOM — click the language toggle, re-audit
{
  const dom = await makeDom(true);
  const { window } = dom;
  const toggle = window.document.getElementById("lang-toggle");
  toggle.click();
  await delay(800);
  const root = window.document.documentElement;
  const bad = await audit(dom, "JavaScript rendered (Arabic, RTL)");
  const h3 = window.document.querySelector("article.card h3");
  console.log(`  lang=${root.lang} dir=${root.dir} firstArticle="${(h3 ? h3.textContent : "MISSING").slice(0, 40)}"`);
  if (bad || root.lang !== "ar" || root.dir !== "rtl" || !h3) exitCode = 1;
  dom.window.close();
}

console.log(exitCode === 0 ? "\nAUDIT PASSED — 0 WCAG violations across all states" : "\nAUDIT FAILED");
process.exit(exitCode);