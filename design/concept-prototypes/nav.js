/* One site navigation for every page of the prototype site. Include with
   <script src="(../)nav.js" defer></script>; links resolve relative to this file. */
(() => {
  if (window.top !== window) return; // inside a viewer frame: the viewer already has the bar
  const base = new URL(".", document.currentScript.src);
  const pages = [
    ["Looks", "index.html", "Pick a look"],
    ["Compare", "redesign/compare.html#owner-home/all", "All six tabs side by side"],
    ["Review", "review.html", "Status, decisions, edge cases"],
    ["Tab notes", "redesign/index.html", "What changed on each tab, for Minsik"],
    ["Full journey", "compare.html#stage-1", "The 5-stage stay, click by click"],
  ];
  const here = location.pathname.replace(/\/$/, "/index.html");
  // Styles ship with the script, so the bar never depends on a cached stylesheet.
  if (!document.getElementById("site-nav-css")) {
    const st = document.createElement("style");
    st.id = "site-nav-css";
    st.textContent = `.site-nav{box-sizing:border-box;width:auto;position:sticky;top:env(safe-area-inset-top,0px);z-index:50;flex:0 0 auto;display:flex;align-items:center;gap:.25rem 1rem;flex-wrap:wrap;padding:.25rem 1rem;background:var(--color-surface,Canvas);border-bottom:1px solid var(--color-border,rgba(127,127,127,.25));font:500 .875rem/1.2 var(--font,Inter,-apple-system,system-ui,sans-serif)}.site-nav a{display:inline-flex;align-items:center;min-height:var(--size-touch-target,44px);padding:0 .625rem;border-radius:var(--radius-md,12px);color:var(--color-text-muted,GrayText);text-decoration:none;white-space:nowrap}.site-nav a:hover{color:var(--color-text,CanvasText);background:var(--color-track,rgba(127,127,127,.15))}.site-nav a[aria-current="page"]{color:var(--color-primary,#2D6A4F);background:var(--color-accent,#D8F3DC);font-weight:600}.site-nav .brand{font-weight:700;color:var(--color-text,CanvasText);padding-left:0}.site-nav .brand:hover{background:none}.site-nav .links{display:flex;gap:.125rem;overflow-x:auto;min-width:0;max-width:100%}`;
    document.head.appendChild(st);
  }
  const nav = document.createElement("nav");
  nav.className = "site-nav";
  nav.setAttribute("aria-label", "Site");
  nav.innerHTML = `<a class="brand" href="${new URL("index.html", base)}">🐾 Goldito design</a><span class="links">` +
    pages.map(([label, href, title]) => {
      const url = new URL(href, base);
      const cur = url.pathname === here;
      return `<a href="${url.pathname}${url.hash}"${cur ? ' aria-current="page"' : ""}>${label}</a>`;
    }).join("") + "</span>";
  document.body.prepend(nav);
  // Run edge to edge even when the page pads its body.
  const cs = getComputedStyle(document.body);
  const [t, l, r] = [cs.paddingTop, cs.paddingLeft, cs.paddingRight].map(parseFloat);
  nav.style.margin = `${-t}px ${-r}px ${t ? 24 : 0}px ${-l}px`;
  if (cs.display.includes("flex") && !cs.flexDirection.startsWith("column")) nav.style.flexBasis = `calc(100% + ${l + r}px)`;
})();
