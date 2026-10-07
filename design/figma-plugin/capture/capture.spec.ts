import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { test } from "@playwright/test";

// Run: serve design/concept-prototypes on :4001, then from frontend/:
//   npx playwright test --config ../design/figma-plugin/capture/playwright.config.ts
// Walks every prototype flow in A, B and C and serializes each state for the Figma plugin.
const BASE = "http://localhost:4001";
const PLUGIN = resolve(__dirname, "..");
const SNAP = readFileSync(`${PLUGIN}/capture/snap.js`, "utf8");
const CONCEPTS = [
  { k: "A", file: "pawnote-concept-a-calm-core.html", label: "A · Calm Core" },
  { k: "B", file: "pawnote-concept-b-full-tamagotchi.html", label: "B · Full Tamagotchi" },
  { k: "C", file: "pawnote-concept-c-balanced-skin.html", label: "C · Balanced Skin" },
].filter((c) => !process.env.ONLY || process.env.ONLY.includes(c.k));
// Design frame size (DESIGN.md §2.1): no bezel, 402 × 874.
const FRAME_CSS = `.phone{border:0!important;border-radius:0!important;width:402px!important;height:874px!important;max-height:none!important;box-shadow:none!important}
  .rig-label{display:none!important} body{padding:0!important}`;

test.setTimeout(600_000);

for (const c of CONCEPTS) {
  test(`capture ${c.k}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    const screens: any[] = [];
    const images: Record<string, string> = {};
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    const open = async (hash = "") => {
      await page.goto(`${BASE}/${c.file}?r=${Date.now()}${hash ? "#" + hash : ""}`);
      await page.addStyleTag({ content: FRAME_CSS });
      await page.addScriptTag({ content: SNAP });
      await page.waitForTimeout(hash ? 900 : 400);
    };
    const settle = () => page.waitForTimeout(450);
    const jr = (a: string) => page.locator(`#phone [data-jr="${a}"]`).first().evaluate((el: HTMLElement) => el.click());
    const ob = (a: string) => page.locator(`#obLayer [data-ob="${a}"]`).first().evaluate((el: HTMLElement) => el.click());
    const tabEl = (key: string) => page.locator(`#phone .tab[data-tab="${key}"], #phone .tab[data-view="${key}"]`).first();
    const tab = async (key: string) => { await tabEl(key).click({ timeout: 5000 }); await settle(); };
    const cap = async (group: string, id: string, title: string) => {
      await settle();
      const { tree, images: imgs } = await page.evaluate(async () => (window as any).__pawnoteSnap(document.getElementById("phone")));
      // Global image table keyed by content hash.
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
      for (const [k, data] of Object.entries(imgs as Record<string, string>)) {
        const h = "i" + createHash("sha1").update(data).digest("hex").slice(0, 12);
        images[h] = data; remap[k] = h;
      }
      const fix = (n: any) => { if (n.img) n.img = remap[n.img] || n.img; if (n.bgImg) n.bgImg = remap[n.bgImg] || n.bgImg; (n.children || []).forEach(fix); };
      fix(tree);
      screens.push({ concept: c.k, group, id, title, tree });
    };

    // ---- Get started › Owner sign-up
    await open();
    await cap("Get started › Owner sign-up", "welcome", "Welcome");
    await ob("start"); await page.locator('#obLayer [data-ob="role"][data-v="owner"]').click();
    await cap("Get started › Owner sign-up", "role", "Role");
    await ob("next"); await cap("Get started › Owner sign-up", "account", "Create account");
    await ob("create"); await page.waitForTimeout(500);
    await cap("Get started › Owner sign-up", "pet", "Add your pet");
    await page.locator("#continueBtn").click(); await page.waitForTimeout(600);
    await cap("Get started › Owner sign-up", "look", "Your look");
    await page.locator("#keepBtn").click();
    await cap("Get started › Owner sign-up", "health", "Health & care");
    await ob("health-save"); await cap("Get started › Owner sign-up", "updates", "Notifications");
    await ob("allow"); await cap("Get started › Owner sign-up", "permission", "Permission prompt");
    await ob("os-allow"); await page.waitForTimeout(500);
    await cap("Home", "home-plan", "Home · plan a stay");
    await tab("feed"); await cap("Feed", "feed-locked", "Feed · before pick-up");

    // ---- Sitter setup
    await open("sitter");
    await cap("Get started › Sitter setup", "sitter-account", "Create account (sitter)");
    await ob("create"); await page.waitForTimeout(400);
    await cap("Get started › Sitter setup", "services", "Services & rates");
    await ob("next"); await cap("Get started › Sitter setup", "house", "House rules");
    await ob("next"); await cap("Get started › Sitter setup", "availability", "Availability");
    await ob("publish"); await page.waitForTimeout(400);
    await cap("Get started › Sitter setup", "live", "Live profile");

    // ---- Returning
    await open("login"); await cap("Get started › Log in", "login", "Log in");

    // ---- Stay 1
    await open("stage-1");
    await cap("Stay › 1 Inquiry", "inquiry", "Inquiry form");
    await jr("second"); await jr("ask"); await page.waitForTimeout(600);
    await page.locator('[data-testid="jr-ai-reply"]').scrollIntoViewIfNeeded();
    await cap("Stay › 1 Inquiry", "inquiry-reply", "AI reply + quote");
    // ---- Stay 2
    await open("stage-2");
    await cap("Stay › 2 Meet & Greet", "care-request", "Care request");
    await jr("generate"); await page.waitForTimeout(500);
    await page.locator('[data-testid="jr-checklist"]').scrollIntoViewIfNeeded();
    await cap("Stay › 2 Meet & Greet", "checklist", "Checklist + Meet & Greet");
    // ---- Stay 3
    await open("stage-3");
    await jr("accept"); await settle();
    await page.locator('[data-testid="jr-stage-booking"] .jr-card').first().scrollIntoViewIfNeeded();
    await cap("Stay › 3 Booking", "checkout", "Checkout + consents");
    for (const box of await page.locator("[data-jr-consent]").all()) await box.check();
    await page.locator("#jrSign").fill("Chloe Park");
    await jr("pay"); await page.waitForTimeout(600);
    await jr("unlock"); await jr("show-code");
    await page.locator('[data-testid="jr-entry"]').scrollIntoViewIfNeeded();
    await cap("Stay › 3 Booking", "paid", "Paid · entry info");
    // ---- Stay 4
    await open("stage-4");
    await cap("Stay › 4 Pick-up & care", "pickup", "Pick-up day");
    await jr("trip-start"); await page.waitForTimeout(700);
    await cap("Stay › 4 Pick-up & care", "trip", "Live trip");
    await jr("trip-skip"); await settle();
    await cap("Stay › 4 Pick-up & care", "arrived", "Arrived");
    await jr("handoff"); await page.waitForTimeout(600);
    await cap("Stay › 4 Pick-up & care", "care-started", "Care started");
    await jr("treat"); await cap("Stay › 4 Pick-up & care", "danger", "Treat Guard · DANGER");
    await page.locator('#jrDanger [data-jr="danger-ok"]').click();
    // 5-second check
    await open("check");
    await page.locator('[data-testid="jr-check"]').scrollIntoViewIfNeeded();
    await cap("Stay › 4 Pick-up & care", "check", "5-second check");
    await jr("check-generate"); await page.waitForTimeout(600);
    await page.locator('[data-testid="jr-check"]').scrollIntoViewIfNeeded();
    await cap("Stay › 4 Pick-up & care", "check-review", "5-second check · draft");
    // In care: tabs
    await open("care");
    await cap("Home", "home-care", "Home · in care");
    for (const [label, id, group] of [["Feed", "feed", "Feed"], ["Care", "care", "Care"], ["Reports", "reports", "Reports"]] as const) {
      await tab(id); await cap(group, id, label);
    }
    // ---- Stay 5
    await open("stage-5");
    await jr("home-start"); await jr("home-skip"); await settle(); await jr("return"); await settle();
    await page.locator('#phone [data-jr="star"][data-v="5"]').click();
    await cap("Stay › 5 Home & review", "review", "Home safe + review");
    await jr("review"); await page.waitForTimeout(600);
    await page.locator('[data-testid="jr-record"]').scrollIntoViewIfNeeded();
    await cap("Stay › 5 Home & review", "record", "Life Record");
    // ---- Over any screen
    await page.locator("#jrBell").click(); await cap("Over any screen", "updates-sheet", "Updates (🔔)");
    await page.locator('#jrOverlay [data-jr="close-sheet"]').click();
    await page.locator("#notesFab").click(); await page.waitForTimeout(400);
    await cap("Over any screen", "notes", "Concept notes (ⓘ)");

    mkdirSync(`${PLUGIN}/data`, { recursive: true });
    writeFileSync(`${PLUGIN}/data/screens-${c.k}.json`, JSON.stringify({ concept: c.k, label: c.label, screens, images }));
    console.log(c.k, screens.length, "screens", Object.keys(images).length, "images", errors);
    await ctx.close();
  });
}
