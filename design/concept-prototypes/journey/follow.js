/* ==========================================================================
   Follow: when a journey prototype runs inside the Prototype page, it tells the
   page which screen you're on (postMessage), so the page's list, notes, Figma link
   and "Today's app" column follow along while you tap. Ids match screens.js.
   ========================================================================== */
(() => {
  if (window.parent === window) return;
  let last = "", touched = false;
  // Only report after you've tapped or typed here: opening a deep link (e.g. Treat Guard on the care screen) isn't navigation.
  ["pointerdown", "keydown"].forEach((t) => addEventListener(t, () => { touched = true; }, true));
  function where() {
    const danger = document.querySelector(".jr-danger");
    if (danger && !danger.hidden) return "treat";
    const bar = document.getElementById("tabbar");
    if (!bar || bar.hidden) return typeof Onboard !== "undefined" && Onboard.flow() === "sitter" ? "sitter" : "owner";
    const tab = document.querySelector('.tab[aria-current="page"]');
    const t = tab ? tab.dataset.tab || tab.dataset.view : "home";
    const stage = typeof Journey !== "undefined" ? Journey.stage() : 0;
    const unlocked = typeof Journey !== "undefined" && Journey.isUnlocked();
    if (t === "stay") return `stage-${Math.min(stage, 4) + 1}`;
    if (t === "reports") return "check";
    if (t === "feed" || t === "care") return "care";
    return unlocked ? "care" : `stage-${Math.min(stage, 4) + 1}`;
  }
  setInterval(() => {
    let id; try { id = where(); } catch (e) { return; }
    if (!touched) { last = id; return; }
    if (id && id !== last) { last = id; window.parent.postMessage({goldito: "at", id}, "*"); }
  }, 400);
})();
/* Icons instead of emoji: each emoji maps to one Lucide icon (Balanced, Expressive) and one Pixelarticons
   icon (Playful). Drawn with CSS masks in currentColor, so they follow each look's colors. Unmapped emoji are removed. */
(() => {
  // Shapes come from icons.js (inlined), so nothing loads from a CDN.
  const url = (k) => (GOLDITO_ICONS[k] ? `url("data:image/svg+xml,${encodeURIComponent(GOLDITO_ICONS[k])}")` : "none");
  const MAP = { // emoji: [lucide, pixel]
    "🏠": ["house", "home"], "🏡": ["house", "home"], "🐶": ["dog", "mood-happy"], "🐱": ["cat", "mood-happy"], "🐾": ["paw-print", "heart"],
    "🔑": ["key", "lock"], "📅": ["calendar", "calendar"], "🗓": ["calendar", "calendar"], "🍽": ["utensils", "coffee"], "🍖": ["bone", "coffee"],
    "🥣": ["utensils", "coffee"], "💊": ["pill", "android"], "🦮": ["footprints", "human-run"], "🐕": ["dog", "human-run"], "🚶": ["footprints", "human-run"],
    "😴": ["moon", "moon"], "💤": ["moon", "moon"], "🎾": ["circle", "zap"], "😊": ["smile", "mood-happy"], "🙂": ["smile", "mood-happy"],
    "😄": ["laugh", "mood-happy"], "😌": ["smile", "mood-neutral"], "📸": ["camera", "camera"], "📷": ["camera", "camera"], "✅": ["circle-check", "check"],
    "✔": ["check", "check"], "⚠": ["triangle-alert", "warning-box"], "🔒": ["lock", "lock"], "🔓": ["lock-open", "lock"], "🚗": ["car", "car"],
    "🚙": ["car", "car"], "💩": ["leaf", "drop"], "🔔": ["bell", "notification"], "⭐": ["star", "zap"], "❤": ["heart", "heart"],
    "💬": ["message-circle", "message"], "📝": ["notebook-pen", "notes"], "🔍": ["search", "search"], "📍": ["map-pin", "pin"],
    "⏱": ["timer", "clock"], "🕒": ["timer", "clock"], "📶": ["wifi-off", "alert"], "🔥": ["flame", "zap"], "💧": ["droplets", "drop"], "🦴": ["bone", "coffee"], "👣": ["footprints", "human-run"], "🐾": ["paw-print", "heart"], "📊": ["chart-column", "chart"], "⚡": ["zap", "zap"], "🥰": ["smile", "mood-happy"], "😋": ["utensils", "coffee"], "🍗": ["bone", "coffee"], "🚿": ["droplets", "drop"],
  };
  const pixel = /^Playful/.test((document.querySelector(".rig-label") || {}).textContent || "");
  const RE = /(\p{Extended_Pictographic}|\p{Regional_Indicator})(️|‍\p{Extended_Pictographic})*\s?/gu;
  const st = document.createElement("style");
  st.textContent = `.pn-ico{display:inline-block;width:1.1em;height:1.1em;vertical-align:middle;position:relative;top:-.06em;background:currentColor;
    -webkit-mask:var(--i) center/contain no-repeat;mask:var(--i) center/contain no-repeat;flex:0 0 auto}.pn-ico.pn-gap{margin-right:.35em}`;
  document.head.appendChild(st);
  const icon = (e) => { const m = MAP[e.replace(/[️‍\s]/g, "")]; if (!m) return null;
    const s = document.createElement("span"); s.className = "pn-ico"; s.setAttribute("aria-hidden", "true");
    s.style.setProperty("--i", url(pixel ? "p:" + m[1] : "l:" + m[0])); return s; };
  function swap(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) =>
      n.parentNode && /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const hits = []; let n;
    while ((n = w.nextNode())) { RE.lastIndex = 0; if (RE.test(n.nodeValue)) hits.push(n); }
    for (const t of hits) {
      const frag = document.createDocumentFragment(); let last = 0; RE.lastIndex = 0; let m;
      while ((m = RE.exec(t.nodeValue))) {
        if (m.index > last) frag.append(t.nodeValue.slice(last, m.index));
        const i = icon(m[0]); if (i) { if (/\S/.test(t.nodeValue.slice(m.index + m[0].length))) i.classList.add("pn-gap"); frag.append(i); }
        last = m.index + m[0].length;
      }
      frag.append(t.nodeValue.slice(last)); t.replaceWith(frag);
    }
  }
  const run = () => swap(document.body);
  document.addEventListener("DOMContentLoaded", () => { run(); new MutationObserver(run).observe(document.body, {childList: true, subtree: true, characterData: true}); });
})();
