import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { test } from "@playwright/test";

// Captures the live-app redesign (design/concept-prototypes/redesign) in each look, plus the live screenshots.
const BASE = "http://localhost:4001/redesign";
const PLUGIN = resolve(__dirname, "..");
const SNAP = readFileSync(`${PLUGIN}/capture/snap.js`, "utf8");
const SCREENS = [
  ["owner-home", "Owner · Home"], ["owner-bookings", "Owner · Bookings"], ["owner-feed", "Owner · Feed"],
  ["owner-diary", "Owner · Diary"], ["owner-mood", "Owner · Mood"], ["sitter-home", "Sitter · Home"],
];
const GROUP = "Redesign · live app tabs (D47)";

test("capture redesign", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
  const page = await ctx.newPage();
  const sets: Record<string, any> = {
    Live: { concept: "Live", label: "Live (Oct 5)", screens: [], images: {} },
    C: { concept: "C", label: "Balanced", screens: [], images: {} },
    B: { concept: "B", label: "Playful", screens: [], images: {} },
  };
  const hash = (d: string) => "i" + createHash("sha1").update(d).digest("hex").slice(0, 12);
  for (const [id, title] of SCREENS) {
    // Live: the screenshot as one full-frame image.
    const png = readFileSync(`${PLUGIN}/../concept-prototypes/redesign/live/${id}.png`).toString("base64");
    const key = hash(png); sets.Live.images[key] = `data:image/png;base64,${png}`;
    sets.Live.screens.push({ concept: "Live", group: GROUP, id, title, tree: { k: "frame", name: "live", x: 0, y: 0, w: 402, h: 874, children: [{ k: "image", name: "screenshot", x: 0, y: 0, w: 402, h: 874, img: key }] } });
    for (const skin of ["C", "B"]) {
      await page.goto(`${BASE}/app.html?skin=${skin.toLowerCase()}&id=${id}#${id}`);
      await page.addScriptTag({ content: SNAP });
      await page.waitForTimeout(800);
      const { tree, images } = await page.evaluate(async () => (window as any).__pawnoteSnap(document.querySelector("#out .phone")));
      // Photograph the layers Figma can't rebuild (pixel art, gradients, canvas).
      const shots: Record<string, string> = {};
      const rids: string[] = await page.evaluate(() => [...document.querySelectorAll("[data-snap-raster]")].map((n) => n.getAttribute("data-snap-raster")!));
      for (const rid of rids) {
        try { shots[rid] = "data:image/png;base64," + (await page.locator(`[data-snap-raster="${rid}"]`).first().screenshot({ omitBackground: true, animations: "disabled", timeout: 5000 })).toString("base64"); } catch (e) {}
      }
      await page.evaluate(() => document.querySelectorAll("[data-snap-raster]").forEach((n) => n.removeAttribute("data-snap-raster")));
      const toImage = (n: any) => { if (n.k === "raster") { n.k = "image"; n.img = shots[n.raster] ? (() => { const h = "i" + createHash("sha1").update(shots[n.raster]).digest("hex").slice(0, 12); (images as any)[h] = shots[n.raster]; return h; })() : undefined; delete n.raster; } (n.children || []).forEach(toImage); };
      toImage(tree);
      const remap: Record<string, string> = {};
      for (const [k, d] of Object.entries(images as Record<string, string>)) { const h = hash(d); sets[skin].images[h] = d; remap[k] = h; }
      const fix = (n: any) => { if (n.img) n.img = remap[n.img] || n.img; if (n.bgImg) n.bgImg = remap[n.bgImg] || n.bgImg; (n.children || []).forEach(fix); };
      fix(tree);
      sets[skin].screens.push({ concept: skin, group: GROUP, id, title, tree });
    }
  }
  writeFileSync(`${PLUGIN}/data/redesign.json`, JSON.stringify(Object.values(sets)));
  console.log("redesign", Object.values(sets).map((s: any) => `${s.label}:${s.screens.length}`).join(" "));
  await ctx.close();
});
