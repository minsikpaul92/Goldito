/* Entry: shows a small window with progress and errors. The captured screen data lives in
   ui.html (large); it is posted here when you press Build. */
let DATA = [];
const say = (msg, kind = "info") => figma.ui.postMessage({ type: "log", msg, kind });

/* A named version in File › Show version history before a run changes the file, so any run can be undone. */
async function restorePoint(what) {
  try {
    await figma.saveVersionHistoryAsync(`Goldito plugin · ${what}`, "Saved by the Goldito plugin before it rebuilt anything.");
    say(`Restore point saved: "Goldito plugin · ${what}" (File › Show version history).`, "ok");
  } catch (e) { say(`Couldn't save a restore point (${e.message || e}); the run goes on.`, "warn"); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

figma.showUI(__html__, { width: 400, height: 600, title: "Goldito Design Sync" });
say(`Plugin loaded. File: ${figma.root.name}. Pages: ${figma.root.children.map((p) => `"${p.name}"`).join(", ")}`);

figma.ui.onmessage = async (m) => {
  if (m.type === "close") { figma.closePlugin(); return; }
  // ---- Tickets tab (src/tickets.js)
  const tickets = async () => figma.ui.postMessage({ type: "tickets", list: await ticketStatuses(m.ids || (m.ticket ? [m.ticket.id] : m.id ? [m.id] : [])) });
  try {
    if (m.type === "tickets-status") { await tickets(); return; }
    if (m.type === "open") { figma.openExternal(m.url); return; }
    if (m.type === "token-get") { figma.ui.postMessage({ type: "token", token: (await figma.clientStorage.getAsync("github-token")) || "" }); return; }
    if (m.type === "token-set") { await figma.clientStorage.setAsync("github-token", m.token || ""); figma.ui.postMessage({ type: "token", token: m.token || "" }); return; }
    if (m.type === "ticket-push") {
      say(`Pushing #${m.ticket.id} to the Tickets page…`);
      await restorePoint(`before pushing #${m.ticket.id}`);
      const plog = [];
      const info = await pushTicket(m.ticket, plog, { rebuild: !!m.rebuild });
      say(`✓ #${info.id} pushed: v${info.version}, ${info.frames.length} frames, ${info.components} components (${info.linked} instances${info.unlinked ? `, ${info.unlinked} drawn as plain layers` : ""}). Status: ${TICKET_STATUS[info.status][0]}.`, "ok");
      if (info.flagged) say(`  ${info.flagged} frame${info.flagged > 1 ? "s" : ""} flagged as new or changed since the last push.`, "ok");
      for (const l of plog.slice(0, 5)) say(l, "warn");
      const sec = await figma.getNodeByIdAsync(info.section);
      if (sec) figma.viewport.scrollAndZoomIntoView([sec]);
      await tickets(); return;
    }
    if (m.type === "devref") {
      say("Building the Dev reference page…");
      await restorePoint("before building the Dev reference page");
      const plog = [];
      const info = await buildDevRef(m.tickets, plog);
      say(`✓ Dev reference: ${info.done.length} sections.`, "ok");
      for (const l of info.done) say(`  ${l}`, "ok");
      for (const l of plog.slice(0, 8)) say(l, "warn");
      const page = await figma.getNodeByIdAsync(info.page);
      if (page) figma.viewport.scrollAndZoomIntoView(page.children);
      return;
    }
    if (m.type === "ticket-submit") {
      let info = (await ticketStatuses([m.ticket.id]))[0];
      if (info.status === "none") info = await pushTicket(m.ticket, []);
      info = await setTicketStatus(m.ticket.id, "review", m.note);
      figma.ui.postMessage({ type: "ticket-comment", id: m.ticket.id, comment: reviewComment(m.ticket, info, m.note, m.mention), issue: m.ticket.issue });
      say(`✓ #${m.ticket.id} is in review (round ${info.rounds.length}). Post the comment on the issue.`, "ok");
      await tickets(); return;
    }
    if (m.type === "ticket-status") { await setTicketStatus(m.id, m.status); say(`#${m.id}: ${TICKET_STATUS[m.status][0]}`, "ok"); await tickets(); return; }
  } catch (e) { say(`Error: ${e && e.message ? e.message : e}`, "error"); return; }
  if (m.type !== "run") return;
  DATA = m.data || [];
  const log = [];
  try {
    const pages = figma.root.children;
    const screensPage = pages.find((p) => /screen/i.test(p.name)) || pages.find((p) => /^2\s*[.)]/.test(p.name));
    const componentsPage = pages.find((p) => /component/i.test(p.name)) || pages.find((p) => /^3\s*[.)]/.test(p.name));
    if (m.brandOnly) {
      const BRAND = m.brand || [];
      say(`Building ${BRAND.length} logo versions on the Brand page…`);
      const n = await buildBrand(BRAND, log);
      for (const l of log) say(l, "warn");
      say(`Done. ${n} logo components on the Brand page.`, "ok");
      return;
    }
    if (!screensPage || !componentsPage) { say('Couldn\'t find the pages. Name one "Screens" and one "Components".', "error"); return; }
    await restorePoint(`before ${[m.components && "components", m.screens && "screens", m.brand && m.brand.length && "brand"].filter(Boolean).join(" and ") || "a run"}`);
    say(`Screens → "${screensPage.name}" · Components → "${componentsPage.name}" · ${DATA.reduce((n, d) => n + d.screens.length, 0)} screens in the data`);
    const withPhoto = DATA.find((d) => Object.values(d.images).some((v) => v.startsWith("data:image/jpeg")));
    const sampleKey = withPhoto && Object.keys(withPhoto.images).find((k) => withPhoto.images[k].startsWith("data:image/jpeg"));
    const sample = sampleKey ? imageHash(withPhoto.images, sampleKey) : null;
    if (!sample) say("No sample pet photo found; photo slots will be grey.", "warn");
    const f = await ensureFoundations(log);
    if (f.variables || f.styles) say(`Created ${f.variables} variables and ${f.styles} text styles (this file didn't have them).`);
    const fonts = await applyFontDecisions(log);
    await initDS(sample);
    say(`Found ${Object.keys(V).length} variables and ${Object.keys(TS).length} text styles.`);
    if (m.components) {
      const looks = await addLookModes(log);
      say(looks ? `Added ${looks} look modes (Balanced, Expressive) to Color.` : "Look modes: already there or not allowed (see warnings).");
      say("Building components…");
      const n = await buildComponents(componentsPage, log);
      say(`✓ ${n} components on "${componentsPage.name}"`, "ok");
    }
    if (m.components && !m.screens) {
      const n = await buildExpressiveComponents(componentsPage, DATA, log);
      say(`✓ ${n} Expressive components on "${componentsPage.name}"`, "ok");
    }
    if (m.screens) {
      say("Building screens… (about a minute)");
      const n = await buildScreens(screensPage, DATA, log, componentsPage);
      say(`✓ ${n} screens on "${screensPage.name}"`, "ok");
      // Tickets that left the Tickets tab (shipped: #147, #120…) keep their sections; Build repairs their variant sets.
      const tp = figma.root.children.find((p) => /ticket/i.test(p.name));
      if (tp) { await tp.loadAsync(); let fixed = 0; for (const n of tp.findAll((k) => k.type === "COMPONENT_SET")) if (fitVariantSet(n)) fixed++; if (fixed) say(`  ${fixed} variant sets on "${tp.name}" resized to fit their variants`, "ok"); }
    }
    if (m.brand && m.brand.length) {
      say("Building logos…");
      const n = await buildBrand(m.brand, log);
      say(`✓ ${n} logo components on the Brand page`, "ok");
    }
    if (m.components || m.screens) {
      say("Applying the team's decisions (fonts, icons, the Decisions board)…");
      for (const line of await applyDecisions(componentsPage, screensPage, log, fonts)) say(`  ${line}`, "ok");
    }
    for (const l of log) say(l, "warn");
    say(log.length ? `Done with ${log.length} warnings.` : "Done. Open the pages to see the result.", "ok");
  } catch (e) {
    say(`Error: ${e && e.message ? e.message : e}`, "error");
    if (e && e.stack) say(String(e.stack).split("\n").slice(0, 4).join(" | "), "error");
  }
};
