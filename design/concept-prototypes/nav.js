/* One site bar for every page of the prototype site: brand · two tabs · language.
   Include with <script src="(../)nav.js" defer></script>; links resolve relative to this file.
   Language: EN / 한국어, remembered per browser. Pages mark text with class "en" / "ko",
   or listen for the "goldito-lang" event and read document.documentElement.dataset.lang. */
(() => {
  const base = new URL(".", document.currentScript.src);
  const root = document.documentElement;
  const store = { get() { try { return localStorage.getItem("goldito-lang"); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem("goldito-lang", v); } catch (e) {} } };
  root.dataset.lang = store.get() === "ko" ? "ko" : "en";
  root.lang = root.dataset.lang;

  const st = document.createElement("style");
  st.id = "site-nav-css";
  st.textContent = `
    html[data-lang="ko"] .en{display:none !important} html:not([data-lang="ko"]) .ko{display:none !important}
    .site-nav{box-sizing:border-box;position:sticky;top:env(safe-area-inset-top,0px);z-index:50;flex:0 0 auto;display:grid;
      grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem;padding:.5rem clamp(1rem,3vw,2rem);
      background:var(--color-surface,Canvas);border-bottom:1px solid var(--color-border,rgba(127,127,127,.25));font:500 .9375rem/1.2 var(--font,Inter,-apple-system,system-ui,sans-serif)}
    .site-nav a{text-decoration:none;color:inherit}
    .site-brand{justify-self:start;display:inline-flex;align-items:center;gap:.5rem;font-weight:700;color:var(--color-text,CanvasText);white-space:nowrap}
    .site-brand i{font-style:normal;display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--color-primary,#2D6A4F);color:#fff;font-size:.875rem}
    .site-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:var(--color-track,rgba(127,127,127,.15))}
    .site-tabs a{display:inline-flex;align-items:center;min-height:40px;padding:0 1.25rem;border-radius:999px;color:var(--color-text-muted,GrayText);font-weight:600;white-space:nowrap}
    .site-tabs a:hover{color:var(--color-text,CanvasText)}
    .site-tabs a[aria-current="page"]{background:var(--color-surface,Canvas);color:var(--color-text,CanvasText);box-shadow:0 0 0 1px var(--color-border,rgba(127,127,127,.25))}
    .site-lang{justify-self:end;display:inline-flex;gap:2px;padding:3px;border-radius:999px;border:1px solid var(--color-border-strong,rgba(127,127,127,.5))}
    .site-lang button{border:0;background:none;min-height:34px;min-width:44px;padding:0 .625rem;border-radius:999px;font:inherit;font-weight:600;font-size:.8125rem;color:var(--color-text-muted,GrayText);cursor:pointer}
    .site-lang button[aria-pressed="true"]{background:var(--color-primary,#2D6A4F);color:var(--color-primary-text,#fff)}
    .site-nav :focus-visible{outline:2px solid var(--color-primary,#2D6A4F);outline-offset:2px}
    @media (max-width:560px){.site-nav{grid-template-columns:auto 1fr auto;gap:.5rem}.site-brand b{display:none}.site-tabs{justify-self:center}.site-tabs a{padding:0 .875rem}}`;
  document.head.appendChild(st);

  if (window.top !== window) return; // inside a viewer frame: no bar, but the language still applies

  const pages = [
    ["Overview", "개요", "index.html"],
    ["Prototype", "프로토타입", "prototype.html"],
  ];
  const here = location.pathname.replace(/\/$/, "/index.html");
  const nav = document.createElement("nav");
  nav.className = "site-nav";
  nav.setAttribute("aria-label", "Site");
  nav.innerHTML = `<a class="site-brand" href="${new URL("index.html", base).pathname}" aria-label="Goldito design, overview"><i aria-hidden="true">🐾</i><b>Goldito design</b></a>
    <span class="site-tabs">${pages.map(([en, ko, href]) => {
      const url = new URL(href, base);
      return `<a href="${url.pathname}"${url.pathname === here ? ' aria-current="page"' : ""}><span class="en">${en}</span><span class="ko">${ko}</span></a>`;
    }).join("")}</span>
    <span class="site-lang" role="group" aria-label="Language"><button type="button" data-l="en">EN</button><button type="button" data-l="ko">한국어</button></span>`;
  document.body.prepend(nav);
  const sync = () => nav.querySelectorAll(".site-lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.l === root.dataset.lang)));
  sync();
  nav.querySelector(".site-lang").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    root.dataset.lang = root.lang = b.dataset.l; store.set(b.dataset.l); sync();
    window.dispatchEvent(new CustomEvent("goldito-lang", {detail: b.dataset.l}));
  });
  // Run edge to edge even when the page pads its body.
  const cs = getComputedStyle(document.body);
  const [t, l, r] = [cs.paddingTop, cs.paddingLeft, cs.paddingRight].map(parseFloat);
  nav.style.margin = `${-t}px ${-r}px ${t ? 24 : 0}px ${-l}px`;
  if (cs.display.includes("flex") && !cs.flexDirection.startsWith("column")) nav.style.flexBasis = `calc(100% + ${l + r}px)`;
})();
