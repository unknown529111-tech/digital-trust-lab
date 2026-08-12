// One-off verification: WCAG 2.x relative-luminance contrast on the ACTUAL
// CSS variable values in css/app.css (both themes). Not part of the repo.
import fs from "node:fs";

const css = fs.readFileSync("css/app.css", "utf8");

function hexToRgb(hex) {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error("bad hex " + hex);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
}
function lin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function parseVars(block) {
  const vars = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) vars[m[1]] = m[2].toLowerCase();
  return vars;
}

const light = parseVars(css.split("[data-theme=\"high-contrast\"]")[0].match(/^:root\s*\{([\s\S]*?)\}/m)[1] + "\n");
const hc = parseVars(css.split("[data-theme=\"high-contrast\"]")[1].split("}")[0] + "\n");

const checks = [
  ["LIGHT --fg on --bg", light.fg, light.bg, 4.5],
  ["LIGHT --fg-soft on --bg", light["fg-soft"], light.bg, 4.5],
  ["LIGHT --link on --bg", light.link, light.bg, 4.5],
  ["LIGHT --accent-fg on --accent", light["accent-fg"], light.accent, 4.5],
  ["LIGHT --chip-fg on --chip-on", light["chip-fg"], light["chip-on"], 4.5],
  ["LIGHT --border on --bg (non-text)", light.border, light.bg, 3.0],
  ["LIGHT --focus on --bg (non-text)", light.focus, light.bg, 3.0],
  ["LIGHT --fg on --bg-alt (alt surfaces)", light.fg, light["bg-alt"], 4.5],
  ["HC --fg on --bg", hc.fg, hc.bg, 7.0],
  ["HC --accent-fg on --accent", hc["accent-fg"], hc.accent, 7.0],
  ["HC --link on --bg", hc.link, hc.bg, 7.0],
  ["HC --fg-soft on --bg", hc["fg-soft"], hc.bg, 7.0],
];

let fail = 0;
for (const [name, fg, bg, min] of checks) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(6)}:1  (needs ${min}:1)  ${name}  [${fg} on ${bg}]`);
}
process.exit(fail ? 1 : 0);