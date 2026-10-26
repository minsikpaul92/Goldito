// Design tokens guard (design site master: ds-status.html). Fails CI when new code adds a raw hex colour, a numeric
// fontSize, or an emoji inside a button label outside the theme. Existing cases are listed in token-baseline.json and
// shrink over time: run `node scripts/check-tokens.mjs --update` after cleaning some up.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "components", "features", "providers", "lib"];
// The theme defines tokens; pixel art and illustrations are artwork with their own palettes; dev routes are tools.
const SKIP = [/^theme\//, /^app\/dev\//, /^features\/pets\/sprites\//, /^components\/pet\//, /^components\/ui\/Art\.tsx$/];
const RULES = [
  { id: "hex", re: /["'`]#[0-9a-fA-F]{3,8}["'`]/, msg: "raw hex colour: use theme.color.*" },
  { id: "fontSize", re: /fontSize:\s*\d/, msg: "numeric fontSize: use theme.fontSize.*" },
  { id: "emojiLabel", re: /label=\{?["'`][^"'`]*\p{Extended_Pictographic}/u, msg: "emoji in a button label: buttons are words" },
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
  });
}

const found = [];
for (const d of DIRS) {
  if (!fs.existsSync(path.join(ROOT, d))) continue;
  for (const file of walk(path.join(ROOT, d))) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (SKIP.some((r) => r.test(rel))) continue;
    fs.readFileSync(file, "utf8").split("\n").forEach((line) => {
      for (const rule of RULES) if (rule.re.test(line) && !line.includes("tokens-ok")) found.push(`${rule.id} ${rel} :: ${line.trim()}`);
    });
  }
}

const baselineFile = path.join(ROOT, "scripts", "token-baseline.json");
if (process.argv.includes("--update")) {
  fs.writeFileSync(baselineFile, JSON.stringify(found.sort(), null, 1) + "\n");
  console.log(`Baseline: ${found.length} known cases.`);
  process.exit(0);
}
const baseline = new Set(fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, "utf8")) : []);
const fresh = found.filter((f) => !baseline.has(f));
const fixed = [...baseline].filter((b) => !found.includes(b)).length;
if (fresh.length) {
  console.error(`Token check: ${fresh.length} new case(s). Use theme tokens (or add // tokens-ok with a reason):`);
  for (const f of fresh) {
    const rule = RULES.find((r) => f.startsWith(r.id + " "));
    console.error(`  ${f.slice(rule.id.length + 1)}\n    → ${rule.msg}`);
  }
  process.exit(1);
}
console.log(`Token check passed (${found.length} known, ${fixed} fixed since the baseline).`);
