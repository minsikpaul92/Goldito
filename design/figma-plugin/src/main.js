/* Entry: shows a small window with progress and errors. The captured screen data lives in
   ui.html (large); it is posted here when you press Build. */
let DATA = [];
const say = (msg, kind = "info") => figma.ui.postMessage({ type: "log", msg, kind });
const tick = () => new Promise((r) => setTimeout(r, 0));

figma.showUI(__html__, { width: 380, height: 460, title: "PawNote Design Sync" });
say(`Plugin loaded. File: ${figma.root.name}. Pages: ${figma.root.children.map((p) => `"${p.name}"`).join(", ")}`);

figma.ui.onmessage = async (m) => {
  if (m.type === "close") { figma.closePlugin(); return; }
  if (m.type !== "run") return;
  DATA = m.data || [];
  const log = [];
  try {
    const pages = figma.root.children;
    const screensPage = pages.find((p) => /screen/i.test(p.name)) || pages.find((p) => /^2\s*[.)]/.test(p.name));
    const componentsPage = pages.find((p) => /component/i.test(p.name)) || pages.find((p) => /^3\s*[.)]/.test(p.name));
    if (!screensPage || !componentsPage) { say('Couldn\'t find the pages. Name one "Screens" and one "Components".', "error"); return; }
    say(`Screens → "${screensPage.name}" · Components → "${componentsPage.name}" · ${DATA.reduce((n, d) => n + d.screens.length, 0)} screens in the data`);
    const withPhoto = DATA.find((d) => Object.values(d.images).some((v) => v.startsWith("data:image/jpeg")));
    const sampleKey = withPhoto && Object.keys(withPhoto.images).find((k) => withPhoto.images[k].startsWith("data:image/jpeg"));
    const sample = sampleKey ? imageHash(withPhoto.images, sampleKey) : null;
    if (!sample) say("No sample pet photo found; photo slots will be grey.", "warn");
    const f = await ensureFoundations(log);
    if (f.variables || f.styles) say(`Created ${f.variables} variables and ${f.styles} text styles (this file didn't have them).`);
    await initDS(sample);
    say(`Found ${Object.keys(V).length} variables and ${Object.keys(TS).length} text styles.`);
    if (m.components) {
      const looks = await addLookModes(log);
      say(looks ? `Added ${looks} look modes (Balanced, Playful) to Color.` : "Look modes: already there or not allowed (see warnings).");
      say("Building components…");
      const n = await buildComponents(componentsPage, log);
      say(`✓ ${n} components on "${componentsPage.name}"`, "ok");
    }
    if (m.screens) {
      say("Building screens… (about a minute)");
      const n = await buildScreens(screensPage, DATA, log, componentsPage);
      say(`✓ ${n} screens on "${screensPage.name}"`, "ok");
    }
    for (const l of log) say(l, "warn");
    say(log.length ? `Done with ${log.length} warnings.` : "Done. Open the pages to see the result.", "ok");
  } catch (e) {
    say(`Error: ${e && e.message ? e.message : e}`, "error");
    if (e && e.stack) say(String(e.stack).split("\n").slice(0, 4).join(" | "), "error");
  }
};
