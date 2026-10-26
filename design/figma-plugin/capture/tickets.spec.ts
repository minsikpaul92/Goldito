import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { resolve } from "path";
import { test } from "@playwright/test";

// Ticket workbenches → data/tickets.json for the plugin's Tickets tab.
// Run: serve design/concept-prototypes on :4001, then from frontend/:
//   NODE_PATH=$PWD/node_modules npx playwright test --config <repo>/design/figma-plugin/capture/playwright.config.ts tickets
// Each workbench page exposes window.__ticket (id, title, links, decisions, spec) and marks its decided frames with
// data-cap / data-title; every marked phone is serialized with snap.js, bezel off, at its own height.
// Captured with auto-layout (flex and grid boxes keep their direction, gap, padding and sizing), and every element
// marked data-comp="Name" (data-variant="Prop=Value, …") becomes an instance of that ticket's own component.
// Parts snap.js can't draw as layers (CSS gradients such as the calendar hatch, pixel art) are photographed.
// A page can also list states to capture after its opening frames (Oct 25): window.__ticketStates = [{ cap, title, sel, go }]:
// go() puts the page in that state (a sheet open, a photo open, another view), then the element at sel (default
// [data-cap="<on>"]) is captured as one more frame named title.
const BASE = "http://localhost:4001";
const PLUGIN = resolve(__dirname, "..");
const SNAP = readFileSync(`${PLUGIN}/capture/snap.js`, "utf8");
// Oct 26: shipped or empty tickets left the list (#147, #120, #117, nav, diary views); their sections stay on the
// Tickets page and Build keeps their variant sets fitted.
const PAGES = ["ticket-119.html", "kit.html", "booking-flow.html", "feed-trial.html", "intro-trial.html", "tone-trial.html", "ux-calls.html", "delights.html", "words-trial.html", "onboarding.html", "sitter-home-trial.html"];
const SETUP = `window.__pawnoteAutoLayout = true;
  window.__pawnoteComps = [{ sel: "[data-comp]", name: (el) => el.dataset.comp, v: (el) => el.dataset.variant || "" }];`;

test.setTimeout(180_000);

test("capture tickets", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const tickets: any[] = [];
  for (const file of PAGES) {
    await page.goto(`${BASE}/${file}?r=${Date.now()}`);
    await page.waitForTimeout(800);
    await page.addStyleTag({ content: "[data-cap]:not([data-cap-keep]){border:0!important;border-radius:0!important;width:402px!important;max-width:none!important}" });
    await page.addScriptTag({ content: SETUP });
    await page.addScriptTag({ content: SNAP });
    await page.waitForTimeout(200);
    const meta = await page.evaluate(() => (window as any).__ticket);
    if (!meta) throw new Error(`${file}: no window.__ticket`);
    const caps = await page.$$eval("[data-cap]", (els) => els.map((e) => [(e as HTMLElement).dataset.cap, (e as HTMLElement).dataset.title]));
    const images: Record<string, string> = {};
    const screens: any[] = [];
    const snapOne = async (id: string, title: string, sel: string) => {
      const { tree, images: im } = await page.evaluate(async (sel) => (window as any).__pawnoteSnap(document.querySelector(sel)), sel);
      Object.assign(images, im);
      // photograph what snap.js marked as raster, then swap those nodes for images
      const rids: string[] = await page.evaluate(() => [...document.querySelectorAll("[data-snap-raster]")].map((n) => n.getAttribute("data-snap-raster")!));
      const shots: Record<string, string> = {};
      for (const rid of rids) {
        try { shots[rid] = "data:image/png;base64," + (await page.locator(`[data-snap-raster="${rid}"]`).first().screenshot({ omitBackground: true, animations: "disabled", timeout: 5000 })).toString("base64"); } catch (e) {}
      }
      await page.evaluate(() => document.querySelectorAll("[data-snap-raster]").forEach((n) => n.removeAttribute("data-snap-raster")));
      const toImage = (n: any) => {
        if (n.k === "raster") {
          n.k = "image";
          const d = shots[n.raster];
          if (d) { const h = "i" + createHash("sha1").update(d).digest("hex").slice(0, 12); images[h] = d; n.img = h; }
          delete n.raster;
        }
        (n.children || []).forEach(toImage);
        if (n.tree) toImage(n.tree);
      };
      toImage(tree);
      screens.push({ id: `t${meta.id}-${id}`, title, tree });
    };
    for (const [id, title] of caps) await snapOne(id!, title!, `[data-cap="${id}"]`);
    const states: [string, string, string][] = await page.evaluate(() => ((window as any).__ticketStates || []).map((x: any) => [x.cap, x.title, x.sel || `[data-cap="${x.on}"]`]));
    for (let i = 0; i < states.length; i++) {
      await page.evaluate((k) => (window as any).__ticketStates[k].go(), i);
      await page.waitForTimeout(700);
      await page.addStyleTag({ content: "[data-cap]:not([data-cap-keep]){border:0!important;border-radius:0!important;width:402px!important;max-width:none!important}" });
      const [id, title, sel] = states[i];
      await snapOne(id, title, sel);
    }
    tickets.push({ ...meta, page: file, captured: new Date().toISOString(), screens, images });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(`${PLUGIN}/data/tickets.json`, JSON.stringify(tickets));
  const count = (n: any, out = { inst: 0, al: 0 }) => { if (n.k === "inst") out.inst++; if (n.al) out.al++; (n.children || []).forEach((c: any) => count(c, out)); if (n.tree) count(n.tree, out); return out; };
  console.log(tickets.map((t) => { const c = t.screens.reduce((a: any, s: any) => { const x = count(s.tree); return { inst: a.inst + x.inst, al: a.al + x.al }; }, { inst: 0, al: 0 });
    return `#${t.id}: ${t.screens.length} frames, ${c.al} auto-layout boxes, ${c.inst} instances`; }).join(" · "));
});
