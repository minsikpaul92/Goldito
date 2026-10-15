// node --test scripts/ — the CHANGELOG parser behind Settings → What's New (11.11).
import assert from "node:assert/strict";
import { test } from "node:test";

import { parse } from "./changelog.mjs";

test("releases, sections and items; plans and empty releases are left out; markdown becomes plain text", () => {
  const md = [
    "# Changelog",
    "## [Unreleased]",
    "### Planned (documented, not shipped)",
    "- Pet status room",
    "## [0.2.0] — 2026-10-15",
    "### Added",
    "- **Photo request** — see [the plan](plan/x.md) and `?view=split`",
    "### Fixed",
    "- Treat check reads the whole label",
  ].join("\n");
  assert.deepEqual(parse(md), [
    {
      version: "0.2.0",
      title: "2026-10-15",
      sections: [
        { heading: "Added", items: ["Photo request — see the plan and ?view=split"] },
        { heading: "Fixed", items: ["Treat check reads the whole label"] },
      ],
    },
  ]);
});
