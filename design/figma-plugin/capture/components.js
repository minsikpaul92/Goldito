/* Which parts of the Expressive prototype become Figma components, and how each occurrence picks its variant.
   Injected before snap.js; snap.js marks every match (outermost only) as an instance of "<name>" with the variant
   string "Prop=Value, …". The plugin builds one component per variant from the first occurrence and places instances
   everywhere else, overriding text and photos. Keep these structurally stable: anything whose layout changes from
   one occurrence to the next (different icons, different numbers of lines of blocks) stays plain layers.
   ok(el) = only elements that pass become components. */
(() => {
  const txt = (el, sel) => ((sel ? el.querySelector(sel) : el)?.textContent || "").replace(/\s+/g, " ").trim();
  const noIcons = (el) => !el.querySelector("svg, img, canvas, .spinner, [class*='ico']");
  const stage = (el) => Number((el.closest("[data-i]") || {}).dataset?.i ?? -1) + 1;
  window.__pawnoteComps = [
    // Chrome
    { sel: "#phone .statusbar", name: "Status Bar" },
    { sel: "#phone .topbar", name: "App Bar" },
    { sel: "#tabbar", name: "Tab Bar · Stay prototype", v: (el) => `Active=${txt(el, ".tab[aria-current]:not([aria-current='false']) .tab-label, .tab[aria-current]:not([aria-current='false'])") || "None"}` },
    { sel: ".xp > .tabs", name: "Tab Bar", v: (el) => `Active=${txt(el, ".tab.on") || "None"}` },
    // The stay
    { sel: ".jr-stage.is-done:not(.jr-page), .jr-stage.is-future", name: "Stage Card", v: (el) => `Stage=${stage(el)}, State=${el.classList.contains("is-done") ? "Done" : "Upcoming"}`, ok: (el) => stage(el) > 0 },
    { sel: ".jr-stage.is-current > .jr-stage-head, .jr-page > .jr-stage-head", name: "Stage Header",
      v: (el) => `Stage=${stage(el)}, Layout=${el.parentElement.classList.contains("jr-page") ? "Pages" : "Sections"}, State=${el.parentElement.classList.contains("is-done") ? "Done" : "Current"}`, ok: (el) => stage(el) > 0 },
    { sel: ".jr-stepper", name: "Stepper", v: (el) => `Viewing=${txt(el, ".is-viewing .jr-step-l") || "?"}, Done=${el.querySelectorAll("li.is-done").length}` },
    { sel: ".jr-check", name: "Checklist Row" },
    { sel: ".jr-consent", name: "Consent Card", v: (el) => `Checked=${el.querySelector("input[type=checkbox]")?.checked ? "Yes" : "No"}` },
    { sel: ".jr-heads > span", name: "Tag", v: () => "Tone=Warning" },
    { sel: ".jr-demo-tag", name: "Demo Tag" },
    { sel: ".jr-bubble", name: "Message Bubble", v: (el) => `From=${el.classList.contains("ai") ? "Sitter" : "Owner"}`, ok: (el) => el.children.length === 0 },
    // Controls
    // Prototype-only controls ("DEMO · Chloe accepts"): their own component, so they never read as app buttons (Oct 25)
    { sel: ".btn.jr-demo", name: "Demo Button", v: (el) => `Width=${el.getBoundingClientRect().width > 300 ? "Fill" : "Hug"}`, ok: noIcons },
    { sel: ".btn.btn-primary, .btn.btn-secondary", name: "Button",
      v: (el) => `Style=${el.classList.contains("btn-danger") ? "Danger" : el.classList.contains("btn-primary") ? "Primary" : "Secondary"}, State=${el.disabled ? "Disabled" : "Enabled"}, Width=${el.getBoundingClientRect().width > 300 ? "Fill" : "Hug"}`, ok: (el) => noIcons(el) && !el.classList.contains("jr-demo") },
    { sel: ".chip", name: "Chip", v: (el) => `State=${el.classList.contains("active") || el.classList.contains("on") || el.getAttribute("aria-pressed") === "true" ? "On" : "Off"}`, ok: (el) => noIcons(el) && el.children.length === 0 },
    // App tabs (redesign/app.html, Expressive)
    // Oct 25: the Moments tabs and the sitter's daily note were plain layers
    { sel: ".xp .vtabs", name: "View Tabs", v: (el) => `Active=${txt(el, ".on") || "None"}`, ok: (el) => el.children.length === 2 && noIcons(el) },
    { sel: ".xp .dnote", name: "Daily Note" },
    { sel: ".xp .li", name: "List Row", ok: (el) => !el.querySelector("img"),
      v: (el) => { const sw = el.querySelector(".sw");
        const trail = el.querySelector(".new") ? "Badge" : sw ? (sw.classList.contains("off") ? "Switch off" : "Switch on") : el.querySelector("svg") ? "Chevron" : "None";
        return `Trailing=${trail}, Lines=${el.querySelector("small") ? 2 : 1}, Tone=${/danger/.test(el.getAttribute("style") || "") ? "Danger" : "Default"}`; } },
  ];
})();
