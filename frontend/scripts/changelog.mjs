// docs/CHANGELOG.md → features/settings/changelog.json for Settings → What's New (Phase 11.11).
// The markdown is the one source; the JSON is committed so builds need no extra step, and CI runs
// `node scripts/changelog.mjs --check` to fail when someone edits one without the other.
//   node scripts/changelog.mjs          write the JSON
//   node scripts/changelog.mjs --check  exit 1 if the JSON is stale
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, "../../docs/CHANGELOG.md");
const TARGET = join(here, "../features/settings/changelog.json");

/** Markdown inline → plain text: links keep their label, bold / code marks go. */
const plain = (s) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

// TEMPORARY (hackathon review): show the 0.x build-up in What's New too. Set to false to show only 1.0.0 and later again.
const SHOW_BEFORE_LAUNCH = true;

export function parse(markdown, showBeforeLaunch = SHOW_BEFORE_LAUNCH) {
  const releases = [];
  let release = null;
  let section = null;
  for (const line of markdown.split(/\r?\n/)) {
    const r = line.match(/^## \[([^\]]+)\](?:\s*[—-]\s*(.+))?/);
    if (r) {
      release = { version: r[1], title: r[2] ? plain(r[2]) : null, sections: [] };
      releases.push(release);
      section = null;
      continue;
    }
    const h = line.match(/^### (.+)/);
    if (h && release) {
      // Plans are not news: What's New lists only what shipped.
      section = /^planned/i.test(h[1]) ? null : { heading: plain(h[1]), items: [] };
      if (section) release.sections.push(section);
      continue;
    }
    const item = line.match(/^- (.+)/);
    if (item && section) section.items.push(plain(item[1]));
  }
  // What's new is news since launch: 0.x is the build-up to 1.0.0 and stays in the file as history only.
  const launched = (rel) => showBeforeLaunch || Number.parseInt(rel.version, 10) >= 1;
  return releases.filter((rel) => launched(rel) && rel.sections.some((s) => s.items.length > 0));
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const json = runDirectly ? `${JSON.stringify(parse(readFileSync(SOURCE, "utf8")), null, 2)}\n` : "";

if (!runDirectly) {
  // Imported by the test: parse() only.
} else if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(TARGET, "utf8");
  } catch {
    // Missing counts as stale.
  }
  if (current.replace(/\r\n/g, "\n") !== json) {
    console.error("features/settings/changelog.json is out of date — run: node scripts/changelog.mjs");
    process.exit(1);
  }
} else {
  writeFileSync(TARGET, json);
}
