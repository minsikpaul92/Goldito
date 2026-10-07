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
