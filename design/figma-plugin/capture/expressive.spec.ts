import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { test, Page } from "@playwright/test";

// Captures the Expressive look exactly as the Prototype tab shows it, for the Figma plugin:
//   App tabs  → redesign/app.html?skin=d#<id>   (fixed 402 × 874)
//   The stay  → pawnote-concept-d-expressive.html in the stepper layout (?stay=pages, the team's pick, Oct 22),
//               walked ① → ⑤ by clicking, each screen at full length
//   Onboarding → owner and sitter sign-up
// SVG images (the gold tag logo) become vector layers, never bitmaps.
// Run: serve design/concept-prototypes on :4001, then from a frontend/ with Playwright installed:
//   NODE_PATH=$PWD/node_modules npx playwright test --config <plugin>/capture/playwright.config.ts expressive
const BASE = "http://localhost:4001";
const PLUGIN = resolve(__dirname, "..");
const SNAP = readFileSync(`${PLUGIN}/capture/components.js`, "utf8") + "\n" + readFileSync(`${PLUGIN}/capture/snap.js`, "utf8");
const JOURNEY = "pawnote-concept-d-expressive.html";
const FRAME_CSS = `.phone{border:0!important;border-radius:0!important;width:402px!important;height:874px!important;max-height:none!important;box-shadow:none!important}
  .rig-label{display:none!important} body{padding:0!important} #toast{display:none!important}`;
const G = { tabs: "Expressive · App tabs", stay: "Expressive · The stay ① – ⑤", ob: "Expressive · Onboarding" };

test.setTimeout(900_000);

const hash = (d: string) => "i" + createHash("sha1").update(d).digest("hex").slice(0, 12);
const svgText = (data: string) => {
  const body = data.slice(data.indexOf(",") + 1);
  return /;base64,/.test(data.slice(0, data.indexOf(",") + 1)) ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body);
};
// An <img> or background whose source is SVG: hand Figma the markup at the node's size.
const toSvgNode = (n: any, data: string) => {
  let s = svgText(data);
  s = s.replace(/<\?xml[^>]*>/, "").replace(/<svg\b([^>]*)>/, (_m, a) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, "")} width="${n.w}" height="${n.h}" preserveAspectRatio="xMidYMid meet">`);
  return { k: "svg", name: n.name || "logo", x: n.x, y: n.y, w: n.w, h: n.h, svg: s, opacity: n.opacity };
};

async function snapInto(page: Page, set: any, rootSel: string, fullLength: boolean) {
  // Park the mouse off the phone first: a hovered button can use color-mix(), which the capture can't read (it dropped the fill).
  await page.mouse.move(1, 1);
  await page.waitForTimeout(150);
  if (fullLength) {
    // Grow the phone so the whole scrolling screen shows; the tab bar stays at the bottom.
    await page.evaluate((sel) => {
      const ph = document.querySelector(sel) as HTMLElement;
      const sc = [...ph.querySelectorAll<HTMLElement>("*")].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.offsetParent && e.clientHeight > 300 && e.scrollHeight > e.clientHeight + 2 && !e.closest("#notesSheet"));
      if (!sc) return;
      sc.scrollTop = 0;
      ph.style.setProperty("height", `${Math.min(3200, 874 + sc.scrollHeight - sc.clientHeight)}px`, "important");
    }, rootSel);
    await page.waitForTimeout(250);
  }
  const { tree, images } = await page.evaluate(async (sel) => (window as any).__pawnoteSnap(document.querySelector(sel)), rootSel);
  // Layers Figma can't rebuild (pixel art, gradients, canvas) are photographed.
  const shots: Record<string, string> = {};
  const rids: string[] = await page.evaluate(() => [...document.querySelectorAll("[data-snap-raster]")].map((n) => n.getAttribute("data-snap-raster")!));
  for (const rid of rids) {
    try { shots[rid] = "data:image/png;base64," + (await page.locator(`[data-snap-raster="${rid}"]`).first().screenshot({ omitBackground: true, animations: "disabled", timeout: 5000 })).toString("base64"); } catch (e) {}
  }
  await page.evaluate(() => document.querySelectorAll("[data-snap-raster]").forEach((n) => n.removeAttribute("data-snap-raster")));
  if (fullLength) await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).style.removeProperty("height"), rootSel);
  const fix = (n: any, parent: any) => {
    if (n.k === "raster") { n.k = "image"; const d = shots[n.raster]; if (d) { const h = hash(d); set.images[h] = d; n.img = h; } delete n.raster; }
    else if (n.img && images[n.img]) {
      const d = images[n.img];
      if (d.startsWith("data:image/svg+xml")) { Object.assign(n, toSvgNode(n, d)); delete n.img; delete n.fit; delete n.radius; }
      else { const h = hash(d); set.images[h] = d; n.img = h; }
    }
    if (n.bgImg && images[n.bgImg]) {
      const d = images[n.bgImg];
      if (d.startsWith("data:image/svg+xml")) { n.children = [toSvgNode({ name: "background", x: 0, y: 0, w: n.w, h: n.h }, d), ...(n.children || [])]; delete n.bgImg; }
      else { const h = hash(d); set.images[h] = d; n.bgImg = h; }
    }
    (n.children || []).forEach((c: any) => fix(c, n));
    if (n.tree) fix(n.tree, n);
  };
  fix(tree, null);
  return tree;
}

test("capture Expressive", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  // The stay prototype prints today's date ("Friday · with Chloe"); a fixed clock keeps captures comparable, so a re-run only flags real changes.
  await page.clock.setFixedTime(new Date("2026-10-23T16:00:00"));
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(45000);
  const go = async (url: string) => { await page.goto(url, { waitUntil: "domcontentloaded" }); try { await page.waitForLoadState("load", { timeout: 15000 }); } catch (e) {} await page.evaluate(() => (document as any).fonts.ready); };
  const errors: string[] = [], skipped: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const D = { concept: "D", label: "Expressive", screens: [] as any[], images: {} as Record<string, string> };

  // ---- App tabs (the Prototype tab's "today" and "next" screens)
  const TABS = [["owner-home", "Owner · Home"], ["owner-bookings", "Owner · Bookings"], ["owner-chat", "Owner · Chat"], ["owner-feed", "Owner · Moments"], ["owner-diary", "Owner · Moments · Diary"],
    ["owner-snap", "Owner · Snap"], ["sitter-home", "Sitter · Home"], ["owner-settings", "Profile → Settings"], ["owner-whatsnew", "Settings → What's New"]];
  for (const [id, title] of TABS) {
    await go(`${BASE}/redesign/app.html?skin=d&r=${Date.now()}#${id}`);
    await page.addScriptTag({ content: "window.__pawnoteAutoLayout = true;" });
    await page.addScriptTag({ content: SNAP });
    await page.waitForTimeout(700);
    D.screens.push({ concept: "D", group: G.tabs, id: `x-${id}`, title, tree: await snapInto(page, D, "#out .xp", false) });
  }

  // ---- Screens added Oct 25 (the ones the app had and Figma didn't): one section per fragment in
  // redesign/fragments/, in the order of each fragment's <!-- TABS: [[id, title], …] --> line.
  const FRAG_DIR = resolve(PLUGIN, "../concept-prototypes/redesign/fragments");
  const FRAG_GROUP: Record<string, string> = { chat: "Expressive · Chat", care: "Expressive · Care and history", bookings: "Expressive · Bookings", snap: "Expressive · Snap", people: "Expressive · Pets, people, schedule", petsetup: "Expressive · Pet setup" };
  for (const file of existsSync(FRAG_DIR) ? readdirSync(FRAG_DIR).filter((n) => n.endsWith(".html")).sort() : []) {
    const m = readFileSync(resolve(FRAG_DIR, file), "utf8").match(/<!-- TABS:\s*(\[[\s\S]*?\])\s*-->/);
    if (!m) continue;
    const group = FRAG_GROUP[file.replace(/\.html$/, "")] || `Expressive · ${file.replace(/\.html$/, "")}`;
    for (const [id, title] of JSON.parse(m[1]) as [string, string][]) {
      await go(`${BASE}/redesign/app.html?skin=d&r=${Date.now()}#${id}`);
      await page.addScriptTag({ content: "window.__pawnoteAutoLayout = true;" });
      await page.addScriptTag({ content: SNAP });
      await page.waitForTimeout(700);
      D.screens.push({ concept: "D", group, id: `x-${id}`, title, tree: await snapInto(page, D, "#out .xp", false) });
    }
  }

  // ---- The stay, walked by clicking (same path as the site's walk test)
  const open = async (hashPart: string, query = "") => {
    await go(`${BASE}/${JOURNEY}?r=${Date.now()}${query}#${hashPart}`);
    await page.addStyleTag({ content: FRAME_CSS });
    await page.addScriptTag({ content: "window.__pawnoteAutoLayout = true;" });
    await page.addScriptTag({ content: SNAP });
    await page.waitForTimeout(1200);
  };
  const c = async (a: string, wait = 500) => {
    const el = page.locator(`#phone [data-jr="${a}"]`).first();
    if (!(await el.count())) { skipped.push(a); return; }
    await el.evaluate((n: HTMLElement) => n.click());
    await page.waitForTimeout(wait);
  };
  const tab = async (k: string) => { await page.locator(`#phone .tab[data-tab="${k}"]`).first().evaluate((n: HTMLElement) => n.click()); await page.waitForTimeout(500); };
  const cap = async (set: any, group: string, id: string, title: string) => set.screens.push({ concept: set.concept, group, id, title, tree: await snapInto(page, set, "#phone", true) });

  await open("stage-1", "&stay=pages");
  await cap(D, G.stay, "s1-profile", "① Sitter profile");
  await c("open-ask"); await cap(D, G.stay, "s1-ask", "① Ask before booking");
  await c("ask", 2400); await cap(D, G.stay, "s1-reply", "① Chloe's reply + quote");
  await c("request", 900); await cap(D, G.stay, "s2-request", "② Care request");
  await c("generate", 2000); await cap(D, G.stay, "s2-checklist", "② Checklist");
  await c("propose"); await c("mg-accept"); await cap(D, G.stay, "s2-meet", "② Meet & Greet agreed");
  await c("meet-done", 900); await cap(D, G.stay, "s3-wait", "③ Waiting for Chloe");
  await c("accept", 700); await cap(D, G.stay, "s3-checkout", "③ Checkout + consents");
  for (const cb of await page.locator("#phone [data-jr-consent]").all()) await cb.check();
  await page.fill("#jrSign", "Robert Park"); await c("pay", 2000); await cap(D, G.stay, "s3-paid", "③ Paid");
  await c("unlock"); await cap(D, G.stay, "s3-entry", "③ Entry info unlocked");
  await c("booking-done", 900); await cap(D, G.stay, "s4-pickup", "④ Pick-up day");
  await c("trip-start"); await c("trip-allow", 400); await cap(D, G.stay, "s4-trip", "④ Live trip");
  await c("trip-skip", 600); await cap(D, G.stay, "s4-arrived", "④ Arrived");
  await c("handoff", 2000); await cap(D, G.stay, "s4-handoff", "④ Handoff photo checked");
  await c("check-open"); await cap(D, G.stay, "s4-check", "④ 5-second check");
  await page.fill("#jrNote", "Learned a new trick"); await page.press("#jrNote", "Enter");
  await c("check-generate", 2000); await cap(D, G.stay, "s4-note", "④ Daily note draft");
  await c("check-send", 900); await c("care-done", 900); await cap(D, G.stay, "s5-home", "⑤ The ride home");
  await c("home-start"); await c("home-allow", 400); await c("home-skip", 600); await cap(D, G.stay, "s5-safe", "⑤ Home safe");
  await c("return", 900); await cap(D, G.stay, "s5-review", "⑤ Review");
  await page.locator('#phone [data-jr="star"]').nth(4).evaluate((n: HTMLElement) => n.click());
  await page.fill("#jrComment", "Max came home so happy."); await c("review", 2400); await cap(D, G.stay, "s5-record", "⑤ Life Record");

  // In care: the other tabs, as the Prototype's "Care in progress" shows them
  await open("care");
  await cap(D, G.stay, "s4-care-home", "④ In care · Home");
  for (const [k, t] of [["feed", "Feed"], ["care", "Care"], ["reports", "Diary"]]) { await tab(k); await cap(D, G.stay, `s4-care-${k}`, `④ In care · ${t}`); }
  await open("treat"); await cap(D, G.stay, "s4-treat", "④ Treat Guard · DANGER");

  // ---- Onboarding (exploration)
  await open("owner"); await cap(D, G.ob, "ob-owner", "Owner sign-up");
  await open("sitter"); await cap(D, G.ob, "ob-sitter", "Sitter setup");

  writeFileSync(`${PLUGIN}/data/expressive.json`, JSON.stringify([D]));
  const comps: Record<string, Set<string>> = {}; let insts = 0;
  const count = (n: any) => { if (n.k === "inst") { insts++; (comps[n.comp] ||= new Set()).add(n.variant); } (n.children || []).forEach(count); if (n.tree) (n.tree.children || []).forEach(count); };
  for (const s of D.screens) count(s.tree);
  console.log(`components: ${Object.keys(comps).length} · instances: ${insts} ·`, Object.entries(comps).map(([k, v]) => `${k} (${v.size})`).join(", "));
  console.log(`Expressive: ${D.screens.length} screens, the stay in the stepper layout · ${Object.keys(D.images).length} images`);
  if (skipped.length) console.log("skipped steps:", skipped.join(", "));
  if (errors.length) console.log("page errors:", errors.slice(0, 5).join(" | "));
  await ctx.close();
});
