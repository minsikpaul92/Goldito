/* Dev reference (Oct 25): one page devs build from. Each section is one feature with its status (decided or a
   proposal, and when), the frames, the decisions and the notes (what to change in the app, copy, rules). Ticket
   sections reuse pushTicket on this page; the app tabs are copies of the Screens page frames. Re-running rebuilds
   only what the plugin drew; notes people add inside a section stay. */

const DEV_STATUS = {
  app: ["Decided · in the app", { r: 0.93, g: 0.99, b: 0.95 }, { r: 0.02, g: 0.46, b: 0.28 }],
  ship: ["Decided · build before Oct 28", { r: 0.85, g: 0.95, b: 0.86 }, { r: 0.11, g: 0.26, b: 0.2 }],
  later: ["Decided · after the freeze", { r: 0.98, g: 0.94, b: 0.78 }, { r: 0.42, g: 0.29, b: 0 }],
  explore: ["Proposal · after the freeze", { r: 0.93, g: 0.93, b: 0.91 }, { r: 0.3, g: 0.3, b: 0.28 }],
  proposal: ["Proposal · needs a team call", { r: 0.99, g: 0.89, b: 0.8 }, { r: 0.6, g: 0.2, b: 0.07 }],
};
const DEVREF = [
  { kind: "screens", key: "nav", title: "App tabs and navigation", status: "app",
    decisions: ["Five tabs: Home · Bookings · Chat · Moments · Snap (#340, #346)", "Moments holds Photos and Diary as View tabs; the pet picker sits at the end of the tabs", "Header C: title, Name · Role, bell, avatar opens the menu (#294)"],
    screens: ["Owner · Home", "Owner · Bookings", "Owner · Chat", "Owner · Moments", "Owner · Moments · Diary", "Owner · Snap", "Sitter · Home"] },
  { kind: "screens", key: "added-oct25", title: "Screens the app had without a design (Oct 25)", status: "proposal",
    decisions: ["28 screens drawn from the app's own code: chat thread and its sheets, 5-second check, tasks, care request, history, notifications, booking detail and sheets, Meet & Greet, entry codes, Snap tools, pet profile, profile, schedule, owner profile", "Each is grounded in the app file named on its frame; departures from the app are listed in the Oct 25 inventory", "Sitter · Owner profile adds pets and stays together, which the app doesn't show yet: a proposal"],
    screens: ["Sitter · Bookings", "Owner · Booking detail", "Sitter · Booking detail", "Booking · Change a handoff (sheet)", "Booking · Return sheet (sitter)", "Meet & Greet · Pick a time", "Owner · Entry codes", "Sitter · 5-second check", "Sitter · Today's tasks", "Sitter · Care request to approve", "Owner · History", "Owner · Notifications", "Chat · thread (owner)", "Chat · thread (sitter)", "Chat · Request booking sheet", "Chat · Send quote sheet", "Chat · Agree sheet", "Chat · Decline sheet", "Chat · + menu", "Owner · Pet profile", "Profile · Edit", "Sitter · Schedule", "Sitter · Owner profile", "Snap · Treat check · Scan", "Snap · Treat check · Safe", "Snap · All treat checks", "Snap · Mood", "Snap · Sticker maker"] },
  { kind: "sprites", key: "pets360", title: "Pets 360 · bodies and motions (Oct 25)", status: "proposal",
    decisions: ["Every Pet options pet with a body, in the app's poses: front 2 · back 2 · side 2 · walk 4 · lie (asleep) 2 · eat 2 · poop 2 frames, 32 × 32", "Side faces right; left is the side mirrored. Heads are the Pet options heads; side and back heads drawn per head type", "Build from weight against the breed's usual weight (under 85% slim, over 120% chonky); legs from the breed", "Swapping these in for the placeholder bodies needs Minsik (scene.ts): a team call", "Live: mooque-dev.github.io/goldito-design/pet-360.html (sprite sheets to download)"] },
  { kind: "ticket", id: "intro", status: "ship" },
  { kind: "ticket", id: "feed", status: "ship" },
  { kind: "ticket", id: "words", status: "ship" },
  { kind: "ticket", id: "diary-views", status: "app" },
  { kind: "stickers", key: "diary-stickers", title: "Diary stickers (Oct 26)", status: "ship",
    decisions: ["Decorate on a Diary page opens a tray: Goldito's own stickers, then the stickers made from the pet's photos (Minsik, Oct 25)", "Goldito's set: Heart, Star, Sun, Paw, Bone, Ball, Sleepy, Best day! (256 × 256 PNG, shown at 128)", "Photo stickers are cut out of a photo with Make a sticker; only their maker sees them in the tray", "Each sticker is a component: place an instance on a Diary page frame. Re-running the plugin updates the art and keeps the instances", "Files: design/concept-prototypes/assets/feed-trial/stickers"] },
  // Oct 25: every design that lived only in our files gets into Figma through the Dev reference too
  { kind: "screens", key: "pet-setup-expressive", title: "Pet setup in the Expressive look (Oct 26)", status: "proposal",
    decisions: ["The owner's pet setup redrawn in today's style: Start, photo with a breed guess, name and kind, breed, age and weight, safety, Ready to book, a personality question, voice, Meet Max, the paw-walk finish and the Home reminder", "Shorter than the app's flow: kind and name, age and weight, and the safety questions each share a screen", "The old page (onboarding.html, below) stays as the full question list"],
    screens: ["Pet setup · Start", "Pet setup · Photo", "Pet setup · Name and kind", "Pet setup · Breed", "Pet setup · Age and weight", "Pet setup · For your sitter's safety", "Pet setup · Ready to book", "Pet setup · Personality question", "Pet setup · Tell us about Max (voice)", "Pet setup · Meet Max", "Pet setup · Welcome to Goldito", "Pet setup · Home reminder"] },
  { kind: "ticket", id: "onboarding", status: "app" },
  { kind: "ticket", id: "booking", status: "proposal" },
  { kind: "ticket", id: "119", status: "app" },
  { kind: "ticket", id: "ux-calls", status: "ship" },
  { kind: "ticket", id: "tone", status: "explore" },
  { kind: "ticket", id: "delights", status: "proposal" },
  { kind: "ticket", id: "sitter-home", status: "proposal" },
];

async function devPage() {
  let page = figma.root.children.find((p) => /dev reference/i.test(p.name));
  if (!page) { page = figma.createPage(); page.name = "Dev reference"; }
  await page.loadAsync();
  return page;
}
async function devPill(status, parent) {
  const [label, bg, ink] = DEV_STATUS[status] || DEV_STATUS.proposal;
  const p = figma.createFrame();
  p.name = "Dev status"; p.layoutMode = "HORIZONTAL"; p.paddingLeft = p.paddingRight = 14; p.paddingTop = p.paddingBottom = 7;
  p.primaryAxisSizingMode = "AUTO"; p.counterAxisSizingMode = "AUTO"; p.cornerRadius = 999; p.fills = [solid(bg)];
  parent.appendChild(p);
  await tText(label, 15, true, ink, p);
  return p;
}

// The page's own header: what this page is, how to read the statuses, where the sources live.
async function devHeader(page) {
  const old = page.children.find((n) => n.getPluginData("pawnote") === "devref-head");
  if (old) old.remove();
  const h = tCard("Dev reference", page);
  h.setPluginData("pawnote", "devref-head");
  h.x = 0; h.y = 0;
  await tText("Dev reference · what to build from", 40, true, T_INK, h);
  const when = new Date().toISOString().slice(0, 10);
  const intro = await tText(`One section per feature, newest decisions first. Each says whether it's decided (and when to build it) or still a proposal, then shows the frames, the decisions and the notes: what to change in the app, the copy, the rules. Rebuilt ${when} from the design site's workbenches; frames people add inside a section stay.`, 16, false, T_MUTED, h);
  intro.resize(1100, intro.height); intro.textAutoResize = "HEIGHT";
  const legend = figma.createFrame();
  legend.name = "Legend"; legend.layoutMode = "HORIZONTAL"; legend.itemSpacing = 12; legend.fills = [];
  legend.primaryAxisSizingMode = "AUTO"; legend.counterAxisSizingMode = "AUTO";
  h.appendChild(legend);
  for (const k of Object.keys(DEV_STATUS)) await devPill(k, legend);
  const src = await tText("Rules: DESIGN.md §7.8 Back and leaving, §7.11 Feedback, §7.12 Actions and forms, §7.13 open calls (branch docs/ux-patterns) · Design site: mooque-dev.github.io/goldito-design · Decisions board: Components page", 13, false, T_MUTED, h);
  src.resize(1100, src.height); src.textAutoResize = "HEIGHT";
  return h;
}

// A section made of copies of the Screens page frames (the app tabs), with its status and decisions.
async function devScreens(page, entry, log) {
  let sec = page.children.find((n) => n.getPluginData("pawnote") === "devref-screens" && n.getPluginData("key") === entry.key);
  if (!sec) {
    sec = figma.createSection(); page.appendChild(sec);
    sec.setPluginData("pawnote", "devref-screens"); sec.setPluginData("key", entry.key);
    let top = 0; for (const n of page.children) if (n !== sec) top = Math.max(top, n.y + n.height + 160);
    sec.x = 0; sec.y = top;
  }
  for (const c of [...sec.children]) if (c.getPluginData("pawnote") === "devref-part") c.remove();
  sec.name = entry.title;
  const head = tCard(entry.title, sec); head.setPluginData("pawnote", "devref-part"); head.x = 40; head.y = 40;
  await tText(entry.title, 32, true, T_INK, head);
  await devPill(entry.status, head);
  for (const d of entry.decisions) await tText(d, 14, false, { r: 0.1, g: 0.1, b: 0.1 }, head);
  const screensPage = figma.root.children.find((p) => /screens/i.test(p.name));
  let x = 40, y = head.y + head.height + 48, rowH = 0, found = 0;
  if (screensPage) {
    await screensPage.loadAsync();
    for (const name of entry.screens) {
      const src = screensPage.findOne((n) => n.type === "FRAME" && (n.name === `D · ${name}` || n.name === name));
      if (!src) { log.push(`Dev reference: no "${name}" on the Screens page yet; run Screens first.`); continue; }
      const c = src.clone(); sec.appendChild(c); c.setPluginData("pawnote", "devref-part");
      c.x = x; c.y = y;
      const cap = await tText(name, 14, true, T_MUTED, sec); cap.setPluginData("pawnote", "devref-part"); cap.x = x; cap.y = y + c.height + 10;
      x += c.width + 40; rowH = Math.max(rowH, c.height + 34); found++;
    }
  } else log.push("Dev reference: no Screens page; run Screens first.");
  let w = 0, h = 0;
  for (const n of sec.children) { w = Math.max(w, n.x + n.width); h = Math.max(h, n.y + n.height); }
  sec.resizeWithoutConstraints(w + 40, h + 40);
  return found;
}

// Pixel pet sprite sheets (PETS360 from data/pets360.json): one row per pet, then the build × legs variants.
async function devSprites(page, entry, log) {
  if (!PETS360) { log.push("Dev reference: no Pets 360 data; run design/pixel-bodies/tama360.py, then build.py."); return 0; }
  let sec = page.children.find((n) => n.getPluginData("pawnote") === "devref-screens" && n.getPluginData("key") === entry.key);
  if (!sec) {
    sec = figma.createSection(); page.appendChild(sec);
    sec.setPluginData("pawnote", "devref-screens"); sec.setPluginData("key", entry.key);
  }
  for (const c of [...sec.children]) if (c.getPluginData("pawnote") === "devref-part") c.remove();
  sec.name = entry.title;
  const head = tCard(entry.title, sec); head.setPluginData("pawnote", "devref-part"); head.x = 40; head.y = 40;
  await tText(entry.title, 32, true, T_INK, head);
  await devPill(entry.status, head);
  for (const d of entry.decisions) await tText(d, 14, false, { r: 0.1, g: 0.1, b: 0.1 }, head);
  await tText(`Frames, left to right: ${PETS360.order}`, 13, false, T_MUTED, head);
  // An image at its own pixel size (the data is already scaled 4x with hard edges).
  const pic = (name, url, x, y) => {
    const b64 = url.slice(url.indexOf(",") + 1), bytes = figma.base64Decode(b64);
    const img = figma.createImage(bytes);
    const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    const r = figma.createRectangle(); sec.appendChild(r);
    r.name = name; r.resize(w, h); r.x = x; r.y = y; r.setPluginData("pawnote", "devref-part");
    r.fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: "FILL", filters: {} }];
    return r;
  };
  let y = head.y + head.height + 48;
  for (const p of PETS360.pets) {
    const cap = await tText(p.label, 16, true, T_INK, sec); cap.setPluginData("pawnote", "devref-part"); cap.x = 40; cap.y = y + 52;
    const r = pic(`Pets 360 · ${p.label}`, p.sheet, 220, y);
    y += r.height + 24;
  }
  y += 40;
  const vt = await tText("Golden pup · build × legs (front, side, back)", 20, true, T_INK, sec); vt.setPluginData("pawnote", "devref-part"); vt.x = 40; vt.y = y;
  y += 44;
  // Three per row: 3 frames × 32 px × 4 = 384 wide, 128 tall, caption under each.
  for (let i = 0; i < PETS360.variants.length; i++) {
    const v = PETS360.variants[i], x = 40 + (i % 3) * (384 + 48), vy = y + Math.floor(i / 3) * (128 + 56);
    pic(`Pets 360 · ${v.name}`, v.img, x, vy);
    const c = await tText(v.name, 13, false, T_MUTED, sec); c.setPluginData("pawnote", "devref-part"); c.x = x; c.y = vy + 132;
  }
  let w = 0, h = 0;
  for (const n of sec.children) { w = Math.max(w, n.x + n.width); h = Math.max(h, n.y + n.height); }
  sec.resizeWithoutConstraints(w + 40, h + 40);
  return PETS360.pets.length;
}

// Diary stickers (STICKERS from build.py): one component per sticker, kept across runs so placed instances survive.
async function devStickers(page, entry, log) {
  if (!STICKERS) { log.push("Dev reference: no sticker files; check concept-prototypes/assets/feed-trial/stickers, then build.py."); return 0; }
  let sec = page.children.find((n) => n.getPluginData("pawnote") === "devref-screens" && n.getPluginData("key") === entry.key);
  if (!sec) {
    sec = figma.createSection(); page.appendChild(sec);
    sec.setPluginData("pawnote", "devref-screens"); sec.setPluginData("key", entry.key);
  }
  for (const c of [...sec.children]) if (c.getPluginData("pawnote") === "devref-part") c.remove();
  sec.name = entry.title;
  const head = tCard(entry.title, sec); head.setPluginData("pawnote", "devref-part"); head.x = 40; head.y = 40;
  await tText(entry.title, 32, true, T_INK, head);
  await devPill(entry.status, head);
  for (const d of entry.decisions) await tText(d, 14, false, { r: 0.1, g: 0.1, b: 0.1 }, head);
  // A sticker component at most `box` on its long side, keeping the art's proportions (size read from the PNG header).
  const comp = (group, s, box, x, y) => {
    const bytes = figma.base64Decode(s.img.slice(s.img.indexOf(",") + 1)), img = figma.createImage(bytes);
    const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19], h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    const k = box / Math.max(w, h), name = `Sticker / ${group} / ${s.name}`;
    let c = sec.children.find((n) => n.type === "COMPONENT" && n.getPluginData("sticker") === name);
    if (!c) { c = figma.createComponent(); sec.appendChild(c); c.setPluginData("sticker", name); }
    c.name = name; c.resize(Math.round(w * k), Math.round(h * k)); c.x = x; c.y = y; c.clipsContent = false;
    c.fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: "FIT", filters: {} }];
    return c;
  };
  let y = head.y + head.height + 48, n = 0;
  for (const [group, label, list, box] of [["Goldito", "Goldito's stickers", STICKERS.goldito, 128], ["Photo", "Made from Mumu's photos (examples)", STICKERS.photos, 160]]) {
    const t = await tText(label, 20, true, T_INK, sec); t.setPluginData("pawnote", "devref-part"); t.x = 40; t.y = y;
    y += 44;
    // Seven per row, a caption under each.
    for (let i = 0; i < list.length; i++) {
      const x = 40 + (i % 7) * (box + 48), cy = y + Math.floor(i / 7) * (box + 64);
      comp(group, list[i], box, x, cy);
      const cap = await tText(list[i].name, 13, false, T_MUTED, sec); cap.setPluginData("pawnote", "devref-part"); cap.x = x; cap.y = cy + box + 8;
      n++;
    }
    y += Math.ceil(list.length / 7) * (box + 64) + 40;
  }
  let w = 0, h = 0;
  for (const c of sec.children) { w = Math.max(w, c.x + c.width); h = Math.max(h, c.y + c.height); }
  sec.resizeWithoutConstraints(w + 40, h + 40);
  return n;
}

async function buildDevRef(tickets, log) {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  const page = await devPage();
  await figma.setCurrentPageAsync(page);
  await devHeader(page);
  const done = [];
  for (const e of DEVREF) {
    if (e.kind === "screens") { const n = await devScreens(page, e, log); done.push(`${e.title}: ${n} screens`); continue; }
    if (e.kind === "sprites") { const n = await devSprites(page, e, log); done.push(`${e.title}: ${n} pets`); continue; }
    if (e.kind === "stickers") { const n = await devStickers(page, e, log); done.push(`${e.title}: ${n} stickers`); continue; }
    const t = (tickets || []).find((x) => String(x.id) === e.id);
    if (!t) { log.push(`Dev reference: ticket "${e.id}" isn't in the capture; run the tickets capture.`); continue; }
    const info = await pushTicket(t, log, { page, dev: e.status });
    done.push(`${t.title}: ${info.frames.length} frames${info.flagged ? `, ${info.flagged} flagged` : ""}`);
  }
  // Keep the sections in the manifest's order, one under the other, below the header.
  const head = page.children.find((n) => n.getPluginData("pawnote") === "devref-head");
  let y = head ? head.y + head.height + 120 : 0;
  for (const e of DEVREF) {
    const sec = e.kind === "screens" || e.kind === "sprites" || e.kind === "stickers"
      ? page.children.find((n) => n.getPluginData("pawnote") === "devref-screens" && n.getPluginData("key") === e.key)
      : page.children.find((n) => n.getPluginData("pawnote") === "ticket" && n.getPluginData("ticket") === e.id);
    if (!sec) continue;
    sec.x = 0; sec.y = y; y += sec.height + 160;
  }
  return { page: page.id, done };
}
