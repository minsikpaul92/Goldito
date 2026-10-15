/* One site bar for every page of the design site: brand · five tabs · guide (?) · language.
   Include with <script src="nav.js" defer></script> (or ../nav.js); links resolve relative to this file.
   Language: EN / 한국어, remembered per browser. Pages mark text with class "en" / "ko",
   or listen for the "goldito-lang" event and read document.documentElement.dataset.lang.
   Tooltips: any element with data-tip="…" (and optional data-tip-ko="…") gets a small label on hover and keyboard focus. */
(() => {
  const base = new URL(".", document.currentScript.src);
  const root = document.documentElement;
  const store = { get() { try { return localStorage.getItem("goldito-lang"); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem("goldito-lang", v); } catch (e) {} } };
  root.dataset.lang = store.get() === "ko" ? "ko" : "en";
  root.lang = root.dataset.lang;
  const ko = () => root.dataset.lang === "ko";

  const C = (name, fallback) => `var(--color-${name},${fallback})`;
  const st = document.createElement("style");
  st.id = "site-nav-css";
  st.textContent = `
    html[data-lang="ko"] .en{display:none !important} html:not([data-lang="ko"]) .ko{display:none !important}
    .site-nav{box-sizing:border-box;position:sticky;top:env(safe-area-inset-top,0px);z-index:50;flex:0 0 auto;display:grid;
      grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem;padding:.5rem clamp(1rem,3vw,2rem);
      background:${C("surface", "var(--surface,Canvas)")};border-bottom:1px solid ${C("border", "var(--tint-border,rgba(127,127,127,.25))")};font:500 .9375rem/1.2 var(--font-ui,var(--font,Inter,-apple-system,system-ui,sans-serif))}
    .site-nav a{text-decoration:none;color:inherit}
    .site-brand{justify-self:start;display:inline-flex;align-items:center;gap:.5rem;font-weight:700;color:${C("text", "var(--text,CanvasText)")};white-space:nowrap}
    .site-brand i{font-style:normal;display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;background:${C("primary", "var(--primary,#2D6A4F)")};color:#fff;font-size:.875rem}
    .site-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:${C("track", "rgba(127,127,127,.15)")};max-width:100%;overflow-x:auto;scrollbar-width:none}
    .site-tabs a{display:inline-flex;align-items:center;min-height:40px;padding:0 1rem;flex:0 0 auto;border-radius:999px;color:${C("text-muted", "var(--text-muted,GrayText)")};font-weight:600;white-space:nowrap}
    .site-tabs a:hover{color:${C("text", "var(--text,CanvasText)")}}
    .site-tabs a[aria-current="page"]{background:${C("surface", "var(--surface,Canvas)")};color:${C("text", "var(--text,CanvasText)")};box-shadow:0 0 0 1px ${C("border", "var(--tint-border,rgba(127,127,127,.25))")}}
    .site-end{justify-self:end;display:inline-flex;align-items:center;gap:.5rem}
    .site-help{width:40px;height:40px;border-radius:50%;border:1px solid ${C("border-strong", "rgba(127,127,127,.5)")};background:none;font:700 1rem/1 inherit;color:${C("text", "var(--text,CanvasText)")};cursor:pointer}
    .site-help[aria-expanded="true"]{background:${C("primary", "#2D6A4F")};color:${C("primary-text", "#fff")};border-color:transparent}
    .site-lang{display:inline-flex;gap:2px;padding:3px;border-radius:999px;border:1px solid ${C("border-strong", "rgba(127,127,127,.5)")}}
    .site-lang button{white-space:nowrap;border:0;background:none;min-height:34px;min-width:44px;padding:0 .625rem;border-radius:999px;font:inherit;font-weight:600;font-size:.8125rem;color:${C("text-muted", "var(--text-muted,GrayText)")};cursor:pointer}
    .site-lang button[aria-pressed="true"]{background:${C("primary", "var(--primary,#2D6A4F)")};color:${C("primary-text", "var(--primary-foreground,#fff)")}}
    .site-nav :focus-visible,.site-guide :focus-visible{outline:2px solid ${C("primary", "var(--primary,#2D6A4F)")};outline-offset:2px}
    /* Guide panel */
    .site-guide{position:fixed;z-index:60;top:calc(env(safe-area-inset-top,0px) + var(--site-nav-h,60px) + 8px);right:clamp(.75rem,3vw,2rem);width:min(24rem,calc(100vw - 1.5rem));max-height:calc(100dvh - var(--site-nav-h,60px) - 24px);overflow:auto;
      background:${C("surface", "Canvas")};color:${C("text", "CanvasText")};border:1px solid ${C("border", "rgba(127,127,127,.3)")};border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.18);padding:1rem 1.125rem;font:400 .875rem/1.5 var(--font-ui,system-ui,sans-serif);display:flex;flex-direction:column;gap:.75rem}
    .site-guide[hidden]{display:none}
    .site-guide h2{margin:0;font:600 1.125rem/1.2 var(--font-display,inherit)}
    .site-guide h3{margin:0;font-size:.6875rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C("text-muted", "GrayText")}}
    .site-guide p{margin:0}
    .site-guide ol,.site-guide ul{margin:0;padding-left:1.125rem;display:flex;flex-direction:column;gap:.375rem}
    .site-guide a{color:${C("primary", "#2D6A4F")};font-weight:600}
    .site-guide .site-pages{list-style:none;padding:0;gap:.25rem}
    .site-guide .site-pages a{display:flex;flex-direction:column;padding:.375rem .5rem;border-radius:10px;text-decoration:none;color:inherit;font-weight:400}
    .site-guide .site-pages a:hover{background:${C("track", "rgba(127,127,127,.12)")}}
    .site-guide .site-pages a[aria-current="page"]{background:${C("accent", "rgba(45,106,79,.12)")}}
    .site-guide .site-pages b{font-weight:700}
    .site-guide .site-pages small{color:${C("text-muted", "GrayText")};font-size:.8125rem}
    .site-guide kbd{font:600 .6875rem/1 ui-monospace,monospace;border:1px solid ${C("border-strong", "#999")};border-bottom-width:2px;border-radius:4px;padding:1px 4px}
    .site-guide .x{align-self:flex-end;margin-top:-.25rem;border:0;background:none;color:${C("text-muted", "GrayText")};font:inherit;font-weight:600;cursor:pointer;min-height:32px}
    /* Tooltip */
    .site-tip{position:fixed;z-index:70;max-width:16rem;padding:.4rem .6rem;border-radius:8px;background:${C("text", "#1A1A1A")};color:${C("surface", "#fff")};font:500 .8125rem/1.35 var(--font-ui,system-ui,sans-serif);pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.18)}
    [data-tip]{cursor:help}
    a[data-tip],button[data-tip],[role="button"][data-tip],label[data-tip]{cursor:pointer}
    @media (max-width:900px){.site-brand b{display:none}}
    @media (max-width:720px){.site-nav{grid-template-columns:auto 1fr;row-gap:.5rem}.site-end{grid-column:2;grid-row:1}.site-tabs{grid-column:1/-1;grid-row:2;justify-self:stretch;display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}
      .site-tabs a{padding:0 .25rem;justify-content:center;text-align:center;font-size:.8125rem;line-height:1.15;min-height:44px;white-space:normal}.site-lang button{min-width:40px;padding:0 .5rem}}`;
  document.head.appendChild(st);

  // ---------- tooltips (all pages, including frames) ----------
  let tip = null, owner = null;
  const hideTip = () => { if (tip) tip.remove(); tip = null; if (owner) owner.removeAttribute("aria-describedby"); owner = null; };
  const showTip = (el) => {
    const text = (ko() && el.dataset.tipKo) || el.dataset.tip; if (!text) return;
    hideTip(); owner = el;
    tip = document.createElement("div"); tip.className = "site-tip"; tip.id = "site-tip"; tip.setAttribute("role", "tooltip"); tip.textContent = text;
    document.body.appendChild(tip); el.setAttribute("aria-describedby", "site-tip");
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    const top = r.top - t.height - 8 > 8 ? r.top - t.height - 8 : r.bottom + 8;
    tip.style.top = `${top}px`; tip.style.left = `${Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2))}px`;
  };
  document.addEventListener("pointerover", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); if (el && el !== owner) showTip(el); else if (!el && owner) hideTip(); });
  document.addEventListener("focusin", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); if (el) showTip(el); });
  document.addEventListener("focusout", hideTip);
  addEventListener("scroll", hideTip, true);
  addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });

  // Inside one of our own frames (the Prototype viewer, the Overview's look previews): no bar.
  // Inside claude.ai (an artifact is shown in a cross-origin frame), the bar still shows.
  let ours = false;
  try { ours = window.parent !== window && !!window.parent.document.querySelector('script[src*="nav.js"]'); } catch (e) { ours = false; }
  if (ours) return;

  const pages = [
    ["Overview", "개요", "index.html", "Start here: status, the three looks, every README promise", "여기서 시작: 현황, 세 가지 룩, README의 모든 약속",
      ["Tap “Play the Draft” to try the design.", "The README table shows, for every promise, whether the app has it and where to play it.", "New to the project? “Get started” has the 3 steps and how to run the app."],
      ["“초안 체험하기”로 디자인을 눌러 보세요.", "README 표는 약속마다 앱에 있는지와 어디서 체험하는지 보여 줘요.", "처음이라면 “시작하기”에 3단계와 앱 실행 방법이 있어요."]],
    ["Prototype", "프로토타입", "prototype.html", "Every screen: today's app next to the Draft, with notes and links", "모든 화면: 지금 앱과 초안을 나란히, 노트와 링크",
      ["Pick a screen on the left (on phones, the menu at the top).", "The Draft phone is tappable; the list and notes follow as you tap.", "Keys: <kbd>↑</kbd> <kbd>↓</kbd> screens, <kbd>1</kbd>–<kbd>4</kbd> looks."],
      ["왼쪽에서 화면을 고르세요 (폰에서는 위쪽 메뉴).", "초안 폰은 누를 수 있고, 누르는 대로 목록과 노트가 따라와요.", "단축키: <kbd>↑</kbd> <kbd>↓</kbd> 화면, <kbd>1</kbd>–<kbd>4</kbd> 룩."]],
    ["Step by step", "단계별", "steps.html", "Booking, care request, Meet & Greet and checkout, one question per screen", "예약, 케어 의뢰서, Meet & Greet, 결제를 한 화면에 질문 하나로",
      ["Tap through the phone, or jump with the thumbnails.", "Keys: <kbd>←</kbd> <kbd>→</kbd> back · next, <kbd>1</kbd>–<kbd>4</kbd> flows, <kbd>L</kbd> larger text, <kbd>D</kbd> dark.", "Reset answers puts the demo data back."],
      ["폰을 누르거나 썸네일로 바로 이동하세요.", "단축키: <kbd>←</kbd> <kbd>→</kbd> 뒤로 · 다음, <kbd>1</kbd>–<kbd>4</kbd> 흐름, <kbd>L</kbd> 글자 크게, <kbd>D</kbd> 다크.", "답 초기화는 데모 데이터로 되돌려요."]],
    ["Brand", "브랜드", "brand.html", "Logo directions, color, type and the design rules", "로고 방향, 색, 서체, 디자인 규칙",
      ["Three logo directions are waiting on one pick (see Plan).", "Swatches show light · dark values of the app's tokens.", "The rules at the bottom apply to every screen."],
      ["로고 세 방향이 하나의 선택을 기다려요 (계획 탭).", "색 견본은 앱 토큰의 라이트 · 다크 값이에요.", "아래 규칙은 모든 화면에 적용돼요."]],
    ["Plan", "계획", "plan.html", "Decisions waiting, the schedule to Oct 30, who does what", "기다리는 결정, 10/30까지 일정, 누가 무엇을",
      ["Decisions come first: each one unblocks work below it.", "The schedule is to scale; ticked, light-green bars are done.", "The design log lists what changed, newest first."],
      ["결정이 먼저: 하나씩 아래 작업을 풀어 줘요.", "일정은 실제 비율이고, 체크된 연한 초록 막대는 끝난 것이에요.", "디자인 기록은 바뀐 것을 최신순으로 보여 줘요."]],
  ];
  const here = location.pathname.replace(/\/$/, "/index.html");
  const page = pages.find(([, , href]) => new URL(href, base).pathname === here) || pages[0];
  const both = (en, k) => `<span class="en">${en}</span><span class="ko">${k}</span>`;
  const nav = document.createElement("nav");
  nav.className = "site-nav";
  nav.setAttribute("aria-label", "Site");
  nav.innerHTML = `<a class="site-brand" href="${new URL("index.html", base).pathname}" aria-label="Goldito design, overview" data-tip="Back to the Overview" data-tip-ko="개요로 돌아가기"><i aria-hidden="true">🐾</i><b>Goldito design</b></a>
    <span class="site-tabs">${pages.map(([en, k, href, ten, tko]) => {
      const url = new URL(href, base);
      return `<a href="${url.pathname}"${url.pathname === here ? ' aria-current="page"' : ""} data-tip="${ten}" data-tip-ko="${tko}">${both(en, k)}</a>`;
    }).join("")}</span>
    <span class="site-end"><button type="button" class="site-help" aria-expanded="false" aria-controls="site-guide" aria-label="Guide: how to use this page" data-tip="How to use this page" data-tip-ko="이 페이지 사용법">?</button>
      <span class="site-lang" role="group" aria-label="Language"><button type="button" data-l="en">EN</button><button type="button" data-l="ko">한국어</button></span></span>`;
  document.body.prepend(nav);
  const sync = () => nav.querySelectorAll(".site-lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.l === root.dataset.lang)));
  sync();
  nav.querySelector(".site-lang").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    root.dataset.lang = root.lang = b.dataset.l; store.set(b.dataset.l); sync();
    window.dispatchEvent(new CustomEvent("goldito-lang", {detail: b.dataset.l}));
  });

  // ---------- guide panel (?) ----------
  const help = nav.querySelector(".site-help");
  const guide = document.createElement("div");
  guide.className = "site-guide"; guide.id = "site-guide"; guide.hidden = true;
  guide.setAttribute("role", "dialog"); guide.setAttribute("aria-label", "Guide");
  guide.innerHTML = `<h2>${both(`On this page: ${page[0]}`, `이 페이지: ${page[1]}`)}</h2>
    <ul>${page[5].map((t, i) => `<li>${both(t, page[6][i])}</li>`).join("")}</ul>
    <h3>${both("New here? Three steps", "처음이라면? 3단계")}</h3>
    <ol><li>${both(`<a href="${new URL("prototype.html#stage-1/c", base).pathname}#stage-1/c">Play the Draft</a>: the whole stay, ① to ⑤.`, `<a href="${new URL("prototype.html", base).pathname}#stage-1/c">초안 체험</a>: 스테이 전체, ①부터 ⑤까지.`)}</li>
      <li>${both(`<a href="${new URL("plan.html", base).pathname}">Check the Plan</a>: what's decided, what's waiting.`, `<a href="${new URL("plan.html", base).pathname}">계획 보기</a>: 정해진 것과 기다리는 것.`)}</li>
      <li>${both(`<a href="${new URL("index.html", base).pathname}#start">Run the real app</a>: hosted demo or on your computer.`, `<a href="${new URL("index.html", base).pathname}#start">실제 앱 실행</a>: 호스팅 데모 또는 내 컴퓨터에서.`)}</li></ol>
    <h3>${both("All pages", "모든 페이지")}</h3>
    <ul class="site-pages">${pages.map(([en, k, href, ten, tko]) => { const url = new URL(href, base);
      return `<li><a href="${url.pathname}"${url.pathname === here ? ' aria-current="page"' : ""}><b>${both(en, k)}</b><small>${both(ten, tko)}</small></a></li>`; }).join("")}</ul>
    <button type="button" class="x">${both("Close", "닫기")}</button>`;
  document.body.appendChild(guide);
  const setGuide = (open) => { guide.hidden = !open; help.setAttribute("aria-expanded", String(open)); hideTip(); if (open) guide.querySelector("a,button").focus(); };
  help.addEventListener("click", () => setGuide(guide.hidden));
  guide.querySelector(".x").addEventListener("click", () => { setGuide(false); help.focus(); });
  document.addEventListener("click", (e) => { if (!guide.hidden && !guide.contains(e.target) && e.target !== help) setGuide(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !guide.hidden) { setGuide(false); help.focus(); } });

  // Run edge to edge even when the page pads its body; tell the guide how tall the bar is.
  const cs = getComputedStyle(document.body);
  const [t, l, r] = [cs.paddingTop, cs.paddingLeft, cs.paddingRight].map(parseFloat);
  nav.style.margin = `${-t}px ${-r}px ${t ? 24 : 0}px ${-l}px`;
  if (cs.display.includes("flex") && !cs.flexDirection.startsWith("column")) nav.style.flexBasis = `calc(100% + ${l + r}px)`;
  const measure = () => root.style.setProperty("--site-nav-h", `${nav.offsetHeight}px`);
  measure(); addEventListener("resize", measure);
})();
