#!/usr/bin/env node
// Builds docs/design/screen-map.md: every route (screen) with the components it shows and every
// action (button, link, checkbox, tappable card) with its label, its stable ID, and file:line.
// It lets a designer or an agent go from a Figma frame or a button label to the code in one search,
// and makes UX changes (move, merge, remove a button) safe to plan.
//
//   node scripts/screen-map.mjs          # write the map
//   node scripts/screen-map.mjs --check  # exit 1 if the map is stale (CI)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.resolve(frontend, "..", "docs", "design", "screen-map.md");

const ACTION_TAGS = ["Button", "TextButton", "LinkButton", "BackLink", "Pressable", "CheckRow", "Stepper", "SegmentedControl"];
const SHOWN_TAGS = ["Tag", "Banner", "EmptyState", "AlertModal", "Sheet"];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(frontend, p).split(path.sep).join("/");

/** The JSX opening tag starting at `start`, up to its closing `>` (skips `>` inside `{…}` and strings). */
function openingTag(src, start) {
  let depth = 0;
  let quote = null;
  // Skip a generic type argument right after the name: `<SegmentedControl<Species>`.
  let from = start + 1;
  const generic = src.slice(start).match(/^<[A-Za-z]+<[^>]*>/);
  if (generic) from = start + generic[0].length;
  for (let i = from; i < src.length && i < start + 2000; i++) {
    const c = src[i];
    // Comments inside `{…}` may hold apostrophes ("Greet's"): skip them whole.
    if (!quote && c === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      continue;
    }
    if (!quote && c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i) + 1;
      continue;
    }
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start, start + 400);
}

/** Value of a JSX attribute as written: "text", {`template`}, or {expression}. */
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}=("([^"]*)"|\\{)`));
  if (!m) return null;
  if (m[2] !== undefined) return m[2];
  let depth = 0;
  const from = m.index + m[0].length - 1;
  for (let i = from; i < tag.length; i++) {
    if (tag[i] === "{") depth++;
    else if (tag[i] === "}" && --depth === 0) return tag.slice(from + 1, i).trim().replace(/\s+/g, " ");
  }
  return null;
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

function scan(file) {
  const src = fs.readFileSync(file, "utf8");
  const items = [];
  const re = new RegExp(`<(${[...ACTION_TAGS, ...SHOWN_TAGS].join("|")})\\b`, "g");
  let m;
  while ((m = re.exec(src))) {
    const tag = openingTag(src, m.index);
    const kind = m[1];
    const label = attr(tag, "label") ?? attr(tag, "accessibilityLabel") ?? attr(tag, "title") ?? attr(tag, "body");
    items.push({ kind, label, id: attr(tag, "testID"), line: lineOf(src, m.index), action: ACTION_TAGS.includes(kind) });
  }
  const imports = [...src.matchAll(/import \{([^}]+)\} from "([^"]+)"/g)]
    .filter(([, , from]) => /components\/|\.\/[A-Z]|features\/[a-z]+\/[A-Z]/.test(from))
    .flatMap(([, names, from]) => names.split(",").map((n) => ({ name: n.trim().replace(/^type /, ""), from })))
    // Only components this file actually renders (`<Name`), not types imported from the same module.
    .filter(({ name }) => /^[A-Z]/.test(name) && new RegExp(`<${name}\\b`).test(src));
  // The doc comment right above the default export (not an earlier one).
  const doc = src.match(/\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*export default function/);
  const summary = doc ? doc[1].replace(/^\s*\* ?/gm, "").replace(/\s+/g, " ").trim() : "";
  return { items, imports, summary };
}

/** expo-router file → URL: groups `(x)` and `index` drop out, `[id]` stays as a parameter. */
function routeOf(file) {
  const parts = rel(file).replace(/^app\//, "").replace(/\.tsx$/, "").split("/");
  const url = parts.filter((p) => !/^\(.*\)$/.test(p) && p !== "index" && p !== "_layout").join("/");
  return "/" + url;
}

const cell = (s) => (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const fmtLabel = (l) => (l == null ? "—" : /^[`{]|^[a-zA-Z_.]+(\(|$)/.test(l) && !/^[A-Z][a-z ]/.test(l) ? `\`${cell(l)}\`` : cell(l));

const routeFiles = walk(path.join(frontend, "app"))
  .filter((f) => !/_layout\.tsx$|\+html\.tsx$|\+not-found/.test(f) && !rel(f).startsWith("app/dev/"))
  .sort((a, b) => routeOf(a).localeCompare(routeOf(b)));
const componentFiles = [...walk(path.join(frontend, "components")), ...walk(path.join(frontend, "features"))]
  .filter((f) => !rel(f).startsWith("components/ui/") && !rel(f).startsWith("components/shell/"))
  .sort();

let missing = 0;
let total = 0;
const table = (items) => {
  const rows = items.map((it) => {
    if (it.action) {
      total++;
      if (!it.id) missing++;
    }
    return `| ${it.kind} | ${fmtLabel(it.label)} | ${it.id ? `\`${cell(it.id)}\`` : it.action ? "**none**" : "—"} | ${it.line} |`;
  });
  return ["| Kind | Label | ID (`testID`) | Line |", "| --- | --- | --- | --- |", ...rows].join("\n");
};

const out = [];
out.push("# Screen map");
out.push("");
out.push("> Generated by `frontend/scripts/screen-map.mjs` — do not edit by hand. Run `node scripts/screen-map.mjs` in `frontend/` after changing a screen.");
out.push(">");
out.push("> How to use it (DESIGN.md §0): find a Figma frame's screen by its route, or a button by its label, then open the file at the line.");
out.push("> **ID** is the stable name of an action (`testID`): the e2e tests and analytics use it, so moving a button keeps its ID, merging two buttons keeps one ID, and removing a button removes its ID from the tests too.");
out.push("");
out.push("## Screens");
out.push("");
for (const f of routeFiles) {
  const { items, imports, summary } = scan(f);
  out.push(`### \`${routeOf(f)}\` — [${rel(f)}](../../frontend/${rel(f)})`);
  out.push("");
  if (summary) out.push(summary, "");
  const own = imports.filter((i) => !i.from.includes("/ui/") && !/^use[A-Z]/.test(i.name));
  if (own.length) out.push(`Shows: ${own.map((i) => `\`${i.name}\``).join(" · ")}`, "");
  if (items.length) out.push(table(items), "");
}
out.push("## Components");
out.push("");
out.push("Screen-level components (`frontend/components/`, `frontend/features/`). Base components (`components/ui/`) are listed in DESIGN.md §6.");
out.push("");
for (const f of componentFiles) {
  const { items } = scan(f);
  if (!items.length) continue;
  out.push(`### ${path.basename(f, ".tsx")} — [${rel(f)}](../../frontend/${rel(f)})`, "", table(items), "");
}
out.push("---");
out.push("");
out.push(`${total} actions · ${total - missing} with an ID · ${missing} without (**none** above — add a \`testID\` when you touch that screen).`);
out.push("");

const text = out.join("\n");
if (process.argv.includes("--check")) {
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== text) {
    console.error("docs/design/screen-map.md is out of date — run `node scripts/screen-map.mjs` in frontend/.");
    process.exit(1);
  }
  console.log("screen map is up to date");
} else {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, text);
  console.log(`wrote ${path.relative(process.cwd(), outFile)} — ${total} actions, ${missing} without an ID`);
}
