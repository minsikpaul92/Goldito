/* ==========================================================================
   Onboarding layer (shared by all three concepts). Built in by build.py.
   Owner:     Welcome → Role → Account → Pet* → Look* → Health & care → Updates → Home
   Sitter:    Welcome → Role → Account → Services & rates → Home & rules → Availability → Live profile
   Returning: Welcome → Log in → Home
   * Pet and Look are each concept's own screens. This layer owns the rest, plus the
   top bar's progress dots and Back while onboarding runs. Prototype only: no real
   accounts, emails or permissions.
   Deep links for testing: #owner #sitter #login #app #stage-1…#stage-5 #care
   ========================================================================== */
const Onboard = (() => {
  const FLOWS = {
    owner: ["welcome", "role", "account", "pet", "look", "health", "updates"],
    sitter: ["welcome", "role", "account", "services", "house", "availability", "live"],
    login: ["welcome", "login"],
  };
  const VARIANT = {pet: 1, look: 2};
  const UNCOUNTED = ["welcome", "live", "login"];
  const ALLERGIES = ["Chicken", "Beef", "Grain", "Dairy"];
  // Personality is split by what the sitter should do with it: "watch" traits are heads-ups, "good" traits are just good to know.
  const WATCH = ["Pulls on leash", "Shy with strangers", "Scared of storms"];
  const GOOD = ["Friendly with dogs", "Good with cats"];
  const ADD_HINT = {allergy: "e.g. Peanut butter", watch: "e.g. Barks at bikes", good: "e.g. Loves car rides"};
  const RULES = ["Fenced yard", "Smoke-free", "Crate available", "Kids at home"];
  const CANCEL = [
    {k: "flexible", t: "Flexible", s: "Full refund up to 24 hours before"},
    {k: "moderate", t: "Moderate", s: "Full refund up to 5 days before"},
    {k: "strict", t: "Strict", s: "50% refund up to 7 days before"},
  ];
  const SERVICES = [
    {k: "boarding", t: "Boarding", s: "Pets stay at your home", unit: "night"},
    {k: "house_sitting", t: "House sitting", s: "You stay at the owner's home", unit: "night"},
    {k: "dropin", t: "Drop-in visits", s: "30-minute visits", unit: "visit"},
  ];
  const SITTER = "Lucy";
  const STAY_NIGHTS = [9, 10, 11]; // Oct 9–12, Thanksgiving on Oct 12 (demo stay)

  let A = null, O = null, el = null, origDots = "", variantStep = 1;
  let enterApp = null, afterEnter = null, busyTimer = null;
  let quiet = false; // opened by a deep link: skip the welcome splash

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const money = (n) => `$${n.toFixed(2)}`;
  const pet = () => A.petName();
  const first = (s) => String(s).trim().split(/\s+/)[0] || "";

  function fresh() {
    return {
      active: true, flow: "owner", i: 0, dir: 1, role: null, busy: "", flash: "", skipPost: false, os: false,
      owner: {name: "Chloe Park", email: "chloe@pawnote.test"},
      sitter: {name: "Lucy Kim", email: "lucy@pawnote.test"},
      health: {age: "Adult", allergies: new Set(["Chicken"]), meds: true, medText: "Skin pill at 2 PM, hidden in a treat",
        watch: new Set(["Pulls on leash"]), good: new Set(["Friendly with dogs"]), vet: "",
        // Options per list; owners can add their own (custom ones carry a remove button).
        opts: {allergy: [...ALLERGIES], watch: [...WATCH], good: [...GOOD]}, custom: new Set(), adding: null},
      notif: {photos: true, care: true, report: true, trip: true}, permission: "unasked",
      services: new Set(["boarding", "house_sitting"]),
      rates: {boarding: 55, house_sitting: 70, dropin: 25, extraPetPct: 50, holidayPct: 25},
      house: {type: "Condo", rules: new Set(["Smoke-free", "Crate available"]), others: "None", maxPets: 2, cancel: "moderate", note: ""},
      avail: new Set([2, 3, 4, 9, 10, 11, 12, 16, 17, 18]),
    };
  }
  const key = () => FLOWS[O.flow][O.i];
  const acct = () => (O.flow === "sitter" ? O.sitter : O.owner);

  // ---------- small builders (shared class vocabulary: btn, chip, input) ----------
  const head = (eyebrow, title, sub) => `<div class="jr-head">${eyebrow ? `<span class="jr-eyebrow">${eyebrow}</span>` : ""}
    <h1 class="jr-title">${title}</h1>${sub ? `<p class="jr-sub">${sub}</p>` : ""}</div>`;
  const chip = (label, act, on, v) =>
    `<button type="button" class="chip${on ? " active" : ""}" data-ob="${act}" data-v="${esc(v)}" aria-pressed="${!!on}">${label}</button>`;
  const primary = (label, act, disabled, id) =>
    `<button type="button" class="btn btn-primary" data-ob="${act}"${id ? ` id="${id}"` : ""}${disabled ? " disabled" : ""}>${O.busy === act ? `<span class="spinner" aria-hidden="true"></span>${label}` : label}</button>`;
  const secondary = (label, act) => `<button type="button" class="btn btn-secondary" data-ob="${act}">${label}</button>`;
  const field = (label, id, value, attrs = "") =>
    `<label class="jr-stack"><span class="jr-label">${label}</span><input class="input" id="${id}" value="${esc(value)}" ${attrs}></label>`;
  const sw = (label, sub, act, v, on, locked) =>
    `<div class="ob-switch-row"><div><b>${label}</b>${sub ? `<span>${sub}</span>` : ""}</div>
      <button type="button" class="ob-switch${on ? " on" : ""}" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}"
        data-ob="${act}" data-v="${v}"${locked ? ' disabled title="Always on"' : ""}><i></i></button></div>`;
  const stepper = (act, value, unit) =>
    `<div class="ob-stepper"><button type="button" data-ob="${act}" data-v="-1" aria-label="Less">−</button>
      <output aria-live="polite"><b>${value}</b>${unit ? `<span>${unit}</span>` : ""}</output>
      <button type="button" data-ob="${act}" data-v="1" aria-label="More">+</button></div>`;
  // A chip list whose options the owner can extend: preset chips toggle, custom chips remove, "+ Add" opens an inline field.
  function tagList(list, selected, act) {
    const h = O.health;
    const chips = h.opts[list].map((x) => h.custom.has(`${list}|${x}`)
      ? `<span class="chip active ob-custom">${esc(x)}<button type="button" class="ob-x" data-ob="tag-remove" data-v="${esc(`${list}|${x}`)}" aria-label="Remove ${esc(x)}">✕</button></span>`
      : chip(esc(x), act, selected.has(x), x)).join("");
    const add = h.adding === list
      ? `<span class="ob-add-row"><input class="input" id="obAdd" maxlength="30" placeholder="${ADD_HINT[list]}" aria-label="New tag">
          <button type="button" class="btn btn-primary btn-sm" data-ob="tag-save" data-v="${list}">Add</button>
          <button type="button" class="ob-x" data-ob="tag-cancel" aria-label="Cancel">✕</button></span>`
      : `<button type="button" class="chip ob-add" data-ob="tag-open" data-v="${list}">+ Add</button>`;
    return chips + add;
  }
  const frame = (body, foot) => `<div class="ob-scroll">${body}</div>${foot ? `<div class="ob-foot">${O.flash ? `<p class="ob-flash" role="status">${esc(O.flash)}</p>` : ""}${foot}</div>` : ""}`;

  // ---------- screens ----------
  const SCREENS = {
    welcome() {
      const pics = (A.samples() || []).slice(0, 3);
      return frame(`<div class="ob-collage" aria-hidden="true">${pics.map((src) => `<img src="${src}" alt="">`).join("")}</div>
        ${head("", "Pet care updates that come to you", "Book a sitter you trust, then follow along with photos, care check-offs and a daily report, without having to ask.")}
        <ul class="ob-values">
          <li><span aria-hidden="true">📸</span><div><b>Photos all day</b><p>Each one with a short AI caption.</p></div></li>
          <li><span aria-hidden="true">✅</span><div><b>Every meal, walk and pill</b><p>Checked off by the sitter as it happens.</p></div></li>
          <li><span aria-hidden="true">🚗</span><div><b>Live pick-up and drop-off</b><p>See the trip and the arrival photo.</p></div></li>
        </ul>`,
        `${primary("Get started", "start")}${secondary("I already have an account", "to-login")}
         <p class="ob-hint">Prototype · no real accounts or data</p>`);
    },
    role() {
      const opt = (v, emoji, t, s) => `<button type="button" class="ob-choice${O.role === v ? " on" : ""}" data-ob="role" data-v="${v}" aria-pressed="${O.role === v}">
        <span class="ob-choice-emoji" aria-hidden="true">${emoji}</span><span><b>${t}</b><span>${s}</span></span><span class="ob-tick" aria-hidden="true">✓</span></button>`;
      return frame(`${head("", "How will you use Goldito?", "You can add the other role later from your profile.")}
        <div class="jr-stack" role="group" aria-label="Role">
          ${opt("owner", "🏡", "I have a pet", "Book sitters and follow along while you're away")}
          ${opt("sitter", "🧺", "I'm a pet sitter", "Get booked, then care, snap and tap. No report typing")}
        </div>`,
        primary("Continue", "next", !O.role));
    },
    account() {
      const a = acct(), sitter = O.flow === "sitter";
      const ok = a.name.trim().length > 1 && /.+@.+\..+/.test(a.email);
      return frame(`${head(sitter ? "Sitter account" : "Owner account", "Create your account", sitter ? "Owners see your first name and photo." : `${SITTER} sees your first name only.`)}
        <div class="ob-social">${secondary("Continue with Apple", "social")}${secondary("Continue with Google", "social")}</div>
        <div class="ob-or"><span>or with email</span></div>
        ${field("Full name", "obName", a.name, 'autocomplete="name"')}
        ${field("Email", "obEmail", a.email, 'type="email" autocomplete="email"')}
        <label class="jr-stack"><span class="jr-label">Password</span><input class="input" id="obPass" type="password" value="demo-only-pass" autocomplete="new-password">
          <span class="ob-meter" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="on"></i><i></i></span><span class="ob-hint" style="text-align:left">Strong enough · demo field, nothing is saved</span></label>`,
        `${primary(O.busy === "create" ? "Creating account…" : "Create account", "create", !ok || !!O.busy, "obCreate")}
         <p class="ob-hint">By continuing you agree to the Terms and Privacy Policy (demo).</p>`);
    },
    login() {
      return frame(`${head("", "Welcome back", "Log in to pick up where you left off.")}
        ${field("Email", "obLoginEmail", O.owner.email, 'type="email" autocomplete="email"')}
        <label class="jr-stack"><span class="jr-label">Password</span><input class="input" type="password" value="demo-only-pass" autocomplete="current-password"></label>
        <button type="button" class="jr-link" style="margin:0" data-ob="forgot">Forgot password?</button>`,
        `${primary(O.busy === "login-go" ? "Logging in…" : "Log in", "login-go", !!O.busy)}<p class="ob-hint">Demo account · Chloe with Max</p>`);
    },
    health() {
      const h = O.health, n = esc(pet());
      if (h.breed == null) h.breed = A.breed() || "";
      return frame(`${head(`About ${n}`, `What should ${SITTER} know about ${n}?`, "This goes with every booking request and becomes the start of the care checklist.")}
        ${field("Breed", "obBreed", h.breed, 'placeholder="e.g. Maltese"')}
        <div class="jr-stack"><span class="jr-label">Age</span><div class="jr-chips">${[A.species() === "dog" ? "Puppy" : "Kitten", "Adult", "Senior"].map((x) => chip(x, "age", h.age === x, x)).join("")}</div></div>
        <div class="jr-stack"><span class="jr-label">Food allergies</span><div class="jr-chips">
          ${chip("None", "allergy-none", h.allergies.size === 0, "")}${tagList("allergy", h.allergies, "allergy")}</div>
          <p class="jr-p">Treat Guard checks every new treat label against this.</p></div>
        <div class="jr-stack"><span class="jr-label">Medication</span><div class="jr-chips">${chip("None", "meds", !h.meds, "0")}${chip("Takes medication", "meds", h.meds, "1")}</div>
          ${h.meds ? `<input class="input" id="obMeds" value="${esc(h.medText)}" placeholder="e.g. Skin pill at 2 PM, hidden in a treat" aria-label="Medication details">` : ""}</div>
        <div class="jr-stack"><span class="jr-label">Watch out for <span class="ob-sub">· ${SITTER} sees these as a heads-up</span></span><div class="jr-chips">${tagList("watch", h.watch, "watch")}</div></div>
        <div class="jr-stack"><span class="jr-label">Good to know</span><div class="jr-chips">${tagList("good", h.good, "good")}</div></div>
        ${field("Vet clinic (optional)", "obVet", h.vet, 'placeholder="e.g. Maple Animal Clinic"')}
        <div class="jr-card ob-preview" aria-live="polite"><span class="jr-label">What ${SITTER} will see</span>
          ${headsHTML()}</div>`,
        `${primary("Save and continue", "health-save")}<button type="button" class="ob-skip" data-ob="health-skip">Skip for now · the sitter will ask at Meet & Greet</button>`);
    },
    updates() {
      const s = O.notif, sit = SITTER, n = esc(pet());
      return frame(`${head("Updates", "Know how it's going without asking", `Pick what ${sit} and Goldito send you. You can change this anytime.`)}
        <div class="ob-push" aria-hidden="true"><span class="ob-push-ico">🐾</span>
          <div><span class="ob-push-top"><b>Goldito</b><small>now</small></span><b>${sit} posted 2 photos of ${n} 📸</b><span>Breakfast done. Finished the whole bowl.</span></div></div>
        <div class="jr-card ob-switches">
          ${sw("Photos and captions", "As they're posted", "notif", "photos", s.photos)}
          ${sw("Care check-offs", "Meals, walks, medication", "notif", "care", s.care)}
          ${sw("Daily report", "Each evening at 8 PM", "notif", "report", s.report)}
          ${sw("Trips and arrivals", "Live pick-up and drop-off", "notif", "trip", s.trip)}
          ${sw("Safety alerts", "Always on: risky treats and emergencies", "notif", "safety", true, true)}
        </div>
        ${O.os ? osPrompt() : ""}`,
        `${primary("Turn on notifications", "allow")}${secondary("Not now", "updates-skip")}`);
    },
    services() {
      const r = O.rates, q = sampleQuote();
      return frame(`${head("Your services", "What do you offer, and for how much?", "Goldito's AI quotes owners from these numbers. It never makes up a price.")}
        ${SERVICES.map((s) => { const on = O.services.has(s.k);
          return `<div class="jr-card ob-service${on ? " on" : ""}">${sw(s.t, s.s, "service", s.k, on)}
            ${on ? `<div class="jr-spread"><span class="jr-p">Rate per ${s.unit}</span>${stepper(`rate-${s.k}`, `$${r[s.k]}`, `/ ${s.unit}`)}</div>` : ""}</div>`; }).join("")}
        <div class="jr-stack"><span class="jr-label">Each extra pet</span><div class="jr-chips">${[25, 50, 75].map((p) => chip(`+${p}%`, "extra", r.extraPetPct === p, p)).join("")}</div></div>
        <div class="jr-stack"><span class="jr-label">Holiday rate</span><div class="jr-chips">${[0, 25, 50].map((p) => chip(p ? `+${p}%` : "None", "holiday", r.holidayPct === p, p)).join("")}</div></div>
        <div class="jr-card ob-quote" aria-live="polite"><span class="jr-label">An owner asking about 2 pets, Oct 9–12 (Thanksgiving) sees</span>
          ${q ? `<b class="ob-big" data-testid="ob-sample-total">${money(q.total)} CAD</b><span class="jr-p">${q.label} · 3 nights · extra pet · holiday</span>` : `<span class="jr-p">Turn on Boarding or House sitting to see a quote.</span>`}</div>`,
        primary("Continue", "next", !O.services.size));
    },
    house() {
      const h = O.house;
      return frame(`${head("Your home", "House rules owners should know", "Written once. The AI quotes these when owners ask, so you don't repeat yourself.")}
        <div class="jr-stack"><span class="jr-label">Home type</span><div class="jr-chips">${["House", "Condo", "Apartment"].map((x) => chip(x, "htype", h.type === x, x)).join("")}</div></div>
        <div class="jr-stack"><span class="jr-label">Your place</span><div class="jr-chips">${RULES.map((x) => chip(x, "rule", h.rules.has(x), x)).join("")}</div></div>
        <div class="jr-stack"><span class="jr-label">Your own pets</span><div class="jr-chips">${["None", "Dog", "Cat"].map((x) => chip(x, "others", h.others === x, x)).join("")}</div></div>
        <div class="jr-spread"><span class="jr-label">Most guest pets at once</span>${stepper("maxpets", h.maxPets, "")}</div>
        <div class="jr-stack" role="radiogroup" aria-label="Cancellation policy"><span class="jr-label">Cancellation</span>
          ${CANCEL.map((c) => `<button type="button" class="ob-choice ob-choice-sm${h.cancel === c.k ? " on" : ""}" role="radio" aria-checked="${h.cancel === c.k}" data-ob="cancel" data-v="${c.k}">
            <span><b>${c.t}</b><span>${c.s}</span></span><span class="ob-tick" aria-hidden="true">✓</span></button>`).join("")}</div>
        <label class="jr-stack"><span class="jr-label">Anything else? (optional)</span>
          <textarea class="input jr-textarea" id="obNote" placeholder="e.g. Quiet building, no barking after 10 PM">${esc(h.note)}</textarea></label>`,
        primary("Continue", "next"));
    },
    availability() {
      const days = Array.from({length: 31}, (_, i) => i + 1);
      const lead = 4; // Oct 1, 2026 is a Thursday
      const nights = O.avail.size;
      return frame(`${head("Availability", "When can you take bookings?", "Tap days to open or close them. Owners only see open days.")}
        <div class="jr-card"><div class="jr-spread"><h3 class="jr-h3">October 2026</h3><span class="ob-cal-acts"><button type="button" class="jr-link" data-ob="weekends">+ Weekends</button><button type="button" class="jr-link" data-ob="clear-days">Clear</button></span></div>
          <div class="ob-cal" role="group" aria-label="October 2026">
            ${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span class="ob-dow" aria-hidden="true">${d}</span>`).join("")}
            ${"<span></span>".repeat(lead)}
            ${days.map((d) => `<button type="button" class="ob-day${O.avail.has(d) ? " on" : ""}${d === 12 ? " hol" : ""}" data-ob="day" data-v="${d}" aria-pressed="${O.avail.has(d)}" aria-label="October ${d}${d === 12 ? ", Thanksgiving" : ""}">${d}</button>`).join("")}
          </div>
          <p class="jr-p"><span class="ob-hol-dot" aria-hidden="true"></span> Thanksgiving, Oct 12 · your +${O.rates.holidayPct}% holiday rate applies</p></div>
        <p class="jr-p" aria-live="polite"><b style="color:var(--text)">${nights} day${nights === 1 ? "" : "s"} open</b> in October</p>`,
        primary("Publish my profile", "publish", !nights));
    },
    live() {
      const r = O.rates, s = O.sitter, h = O.house, n = first(s.name) || "You", q = sampleQuote();
      const free = STAY_NIGHTS.every((d) => O.avail.has(d));
      return frame(`${head("You're live", `You're ready to be booked, ${esc(n)}`, "Here's what owners see, and how Goldito answers for you.")}
        <div class="jr-card ob-profile" data-testid="ob-profile"><div class="jr-row"><span class="ob-avatar" aria-hidden="true">${esc(n[0] || "L")}</span>
          <div><b>${esc(s.name)}</b><span class="jr-p" style="display:block">New sitter · ${h.type} · up to ${h.maxPets} pets</span></div></div>
          <div class="jr-stack">${SERVICES.filter((x) => O.services.has(x.k)).map((x) => `<div class="jr-spread"><span>${x.t}</span><b>$${r[x.k]} / ${x.unit}</b></div>`).join("")}</div>
          <div class="jr-chips">${[...h.rules].map((x) => `<span class="chip">${x}</span>`).join("")}<span class="chip">${CANCEL.find((c) => c.k === h.cancel).t} cancellation</span></div></div>
        <div class="jr-stack"><span class="jr-label">An owner asks</span><div class="jr-thread">
          <div class="jr-bubble me">Are you free Oct 9–12 for Max and Mochi?</div>
          <div class="jr-bubble ai"><div class="jr-ai-label">✦ Auto-reply from your Goldito assistant</div>
            ${free && q ? `Hi! ${esc(n)} is free Oct 9–12 for Max and Mochi. ${q.label}: <b>${money(q.total)} CAD</b> for 3 nights, including the Thanksgiving rate.`
              : `Hi! ${esc(n)} isn't free for all of Oct 9–12. Here are the open days this month: ${[...O.avail].sort((a, b) => a - b).slice(0, 4).map((d) => `Oct ${d}`).join(", ")}.`}
            <div class="jr-src"><span>From your calendar</span><span>From your rates</span><span>From your house rules</span></div></div></div></div>`,
        `${primary("Try it as an owner", "as-owner")}${secondary("Start over", "restart")}`);
    },
  };

  // Heads-up (warning tone) for allergies, medication and watch-outs; good-to-know traits stay neutral — never shown as alerts.
  function headsHTML() {
    const h = O.health;
    const heads = [...h.allergies].map((x) => `Allergic to ${x.toLowerCase()}`)
      .concat(h.meds && h.medText.trim() ? [h.medText.trim()] : [], [...h.watch]);
    const good = [...h.good];
    if (!heads.length && !good.length) return `<div class="jr-heads"><span class="ob-none">Nothing yet</span></div>`;
    return (heads.length ? `<div class="ob-heads-group"><span class="ob-heads-title">Heads-up</span><div class="jr-heads">${heads.map((x) => `<span class="warn">⚠️ ${esc(x)}</span>`).join("")}</div></div>` : "")
      + (good.length ? `<div class="ob-heads-group"><span class="ob-heads-title">Good to know</span><div class="jr-heads">${good.map((x) => `<span class="good">${esc(x)}</span>`).join("")}</div></div>` : "");
  }
  function osPrompt() {
    return `<div class="ob-os" role="alertdialog" aria-modal="true" aria-labelledby="obOsT"><div class="ob-os-card">
      <div class="ob-os-body"><b id="obOsT">“Goldito” Would Like to Send You Notifications</b>
        <span>Notifications may include alerts, sounds and icon badges. These can be configured in Settings.</span></div>
      <div class="ob-os-btns"><button type="button" data-ob="os-deny">Don’t Allow</button><button type="button" data-ob="os-allow"><b>Allow</b></button></div>
      </div><span class="ob-os-tag">Simulated system prompt</span></div>`;
  }

  // Same formula as the stay quote (03C): nights × rate, extra pet %, holiday % on holiday days.
  function sampleQuote() {
    const k = ["boarding", "house_sitting"].find((x) => O.services.has(x));
    if (!k) return null;
    const rate = O.rates[k], extraRate = rate * O.rates.extraPetPct / 100;
    const base = rate * 3, extra = extraRate * 3;
    const holiday = Math.round((rate + extraRate) * O.rates.holidayPct) / 100;
    return {label: k === "boarding" ? "Boarding" : "House sitting", total: Math.round((base + extra + holiday) * 100) / 100};
  }

  // ---------- chrome: progress dots + Back in the concept's own top bar ----------
  function syncChrome() {
    const k = key(), p = A.phone, steps = FLOWS[O.flow].filter((s) => !UNCOUNTED.includes(s));
    const pos = steps.indexOf(k);
    const back = O.i > 0 && k !== "live";
    p.classList.add("ob-on");
    p.classList.toggle("ob-back", back);
    p.classList.toggle("ob-noback", !back);
    A.dots.style.visibility = pos < 0 ? "hidden" : "";
    A.dots.innerHTML = steps.map((_, j) => `<div class="step-dot${j === pos ? " active" : ""}${j < pos ? " done" : ""}"></div>`).join("");
    A.dots.setAttribute("aria-label", pos < 0 ? "Welcome" : `Step ${pos + 1} of ${steps.length}`);
  }
  function restoreChrome() {
    A.phone.classList.remove("ob-on", "ob-back", "ob-noback");
    A.dots.style.visibility = "";
    A.dots.innerHTML = origDots;
  }
  function place() {
    const pr = A.phone.getBoundingClientRect(), tr = A.topbar.getBoundingClientRect();
    el.style.setProperty("--ob-top", `${Math.max(0, tr.bottom - pr.top - A.phone.clientTop)}px`);
  }

  function render(animate) {
    const k = key();
    syncChrome();
    if (VARIANT[k]) {
      el.hidden = true;
      if (variantStep !== VARIANT[k]) A.goStep(VARIANT[k]);
      return;
    }
    const scroll = el.querySelector(".ob-scroll");
    const keepScroll = !animate && scroll ? scroll.scrollTop : 0;
    el.hidden = false;
    el.dataset.screen = k;
    el.classList.toggle("ob-enter", !!animate);
    place();
    el.innerHTML = SCREENS[k]();
    const ns = el.querySelector(".ob-scroll");
    if (ns) ns.scrollTop = keepScroll;
    if (animate && ns && !reduce() && ns.animate)
      ns.animate([{opacity: 0, transform: `translateX(${O.dir * 1.25}rem)`}, {opacity: 1, transform: "none"}],
        {duration: 260, easing: "cubic-bezier(.2,.8,.2,1)"});
  }
  function go(i) { O.dir = i > O.i ? 1 : -1; O.i = i; O.busy = ""; O.flash = ""; render(true); }
  function next() { go(O.i + 1); }
  function back() { if (O.i > 0) go(O.i - 1); }
  function busy(act, ms, then) {
    O.busy = act; render();
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => { O.busy = ""; then(); }, reduce() ? 150 : ms);
  }
  function pop(b) { if (!b || reduce()) return; b.classList.remove("ob-pop"); void b.offsetWidth; b.classList.add("ob-pop"); }
  function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); }

  // Hands off to the concept's own "enter the app" step (welcome animation etc.).
  function complete() {
    const fn = enterApp; enterApp = null;
    if (fn) fn(); else A.goStep(3);
  }
  function finishOwner(permission) {
    O.permission = permission; O.os = false;
    if (permission === "granted") A.toast("Notifications on", "You'll hear about each photo, check-off and report.");
    else if (permission === "denied") A.toast("Notifications off", "Updates still collect under 🔔 in the app.");
    complete();
  }

  function handle(act, v, b) {
    const h = O.health;
    switch (act) {
      case "start": O.flow = O.role === "sitter" ? "sitter" : "owner"; next(); return;
      case "to-login": O.flow = "login"; go(1); return;
      case "role": O.role = v; O.flow = v; render(); pop(el.querySelector(`.ob-choice[data-v="${v}"]`)); return;
      case "next": next(); return;
      case "social": O.flash = "Demo only: use email for this prototype."; render(); return;
      case "create":
        busy("create", 800, next);
        if (O.flow === "owner") Journey.configure({owner: first(O.owner.name)});
        return;
      case "forgot": O.flash = "Demo only: no reset email is sent."; render(); return;
      case "login-go":
        busy("login-go", 700, () => { O.busy = "login-go"; O.skipPost = true; A.skipToApp(); });
        return;
      case "age": h.age = v; break;
      case "allergy": toggle(h.allergies, v); break;
      case "allergy-none": h.allergies.clear(); break;
      case "meds": h.meds = v === "1"; break;
      case "watch": toggle(h.watch, v); break;
      case "good": toggle(h.good, v); break;
      case "tag-open": h.adding = v; render(); { const i = el.querySelector("#obAdd"); if (i) i.focus(); } return;
      case "tag-cancel": h.adding = null; break;
      case "tag-save": {
        const i = el.querySelector("#obAdd"), t = (i ? i.value : "").trim().replace(/\s+/g, " ");
        if (!t) { h.adding = null; break; }
        const label = t.charAt(0).toUpperCase() + t.slice(1);
        const list = v, sel = list === "allergy" ? h.allergies : h[list];
        if (!h.opts[list].some((x) => x.toLowerCase() === label.toLowerCase())) { h.opts[list].push(label); h.custom.add(`${list}|${label}`); }
        sel.add(h.opts[list].find((x) => x.toLowerCase() === label.toLowerCase()));
        h.adding = null; break;
      }
      case "tag-remove": {
        const [list, label] = v.split("|");
        h.opts[list] = h.opts[list].filter((x) => x !== label); h.custom.delete(v);
        (list === "allergy" ? h.allergies : h[list]).delete(label); break;
      }
      case "health-save":
        Journey.configure({allergy: h.allergies.size ? [...h.allergies][0].toLowerCase() : null});
        next(); return;
      case "health-skip": next(); return;
      case "notif": O.notif[v] = !O.notif[v]; break;
      case "allow": O.os = true; render(); el.querySelector('[data-ob="os-allow"]').focus(); return;
      case "os-allow": finishOwner("granted"); return;
      case "os-deny": finishOwner("denied"); return;
      case "updates-skip": finishOwner("later"); return;
      case "service": toggle(O.services, v); break;
      case "extra": O.rates.extraPetPct = Number(v); break;
      case "holiday": O.rates.holidayPct = Number(v); break;
      case "htype": O.house.type = v; break;
      case "rule": toggle(O.house.rules, v); break;
      case "others": O.house.others = v; break;
      case "maxpets": O.house.maxPets = Math.min(4, Math.max(1, O.house.maxPets + Number(v))); break;
      case "cancel": O.house.cancel = v; break;
      case "day": toggle(O.avail, Number(v)); break;
      case "weekends": [3, 4, 10, 11, 17, 18, 24, 25, 31].forEach((d) => O.avail.add(d)); break;
      case "clear-days": O.avail.clear(); break;
      case "publish":
        Journey.configure({rates: {boarding: O.rates.boarding, house_sitting: O.rates.house_sitting,
          extraPetPct: O.rates.extraPetPct, holidayPct: O.rates.holidayPct}});
        busy("publish", 700, () => { next(); A.celebrate("record", el.querySelector(".ob-profile")); });
        return;
      case "as-owner": O.role = "owner"; O.flow = "owner"; go(FLOWS.owner.indexOf("account")); return;
      case "restart": reset(); return;
      default:
        if (act.startsWith("rate-")) {
          const k = act.slice(5);
          O.rates[k] = Math.min(150, Math.max(10, O.rates[k] + Number(v) * 5));
          break;
        }
        return;
    }
    render();
    pop(el.querySelector(`[data-ob="${act}"][data-v="${CSS.escape(String(v))}"]`));
  }

  function onInput(e) {
    const t = e.target, a = acct();
    if (t.id === "obName") a.name = t.value;
    else if (t.id === "obEmail") a.email = t.value;
    else if (t.id === "obMeds") O.health.medText = t.value;
    else if (t.id === "obBreed") O.health.breed = t.value;
    else if (t.id === "obVet") O.health.vet = t.value;
    else if (t.id === "obNote") O.house.note = t.value;
    else return;
    const c = document.getElementById("obCreate");
    if (c && !O.busy) c.disabled = !(a.name.trim().length > 1 && /.+@.+\..+/.test(a.email));
    const prev = el.querySelector(".ob-preview .jr-heads");
    if (prev && t.id === "obMeds") prev.innerHTML = headsHTML();
  }

  // ---------- public ----------
  function step(n) {
    variantStep = n;
    if (!O || !O.active) return;
    if (n === 3) { finish(); return; }
    const idx = FLOWS[O.flow].indexOf(n === 1 ? "pet" : "look");
    if (idx >= 0) { O.dir = idx > O.i ? 1 : -1; O.i = idx; syncChrome(); el.hidden = true; }
  }
  function after(done) {
    if (!O || !O.active || O.skipPost || O.flow !== "owner") { done(); return; }
    enterApp = done;
    go(FLOWS.owner.indexOf("health"));
  }
  function finish() {
    if (!O || !O.active) return;
    O.active = false; el.hidden = true; restoreChrome();
    const cb = afterEnter; afterEnter = null;
    if (cb) setTimeout(cb, 0);
  }
  function reset() {
    clearTimeout(busyTimer);
    O = fresh(); enterApp = null; afterEnter = null; quiet = false;
    Journey.configure({owner: "Chloe", allergy: "chicken", rates: {boarding: 55, house_sitting: 70, extraPetPct: 50, holidayPct: 25}});
    render(true);
  }
  // Testing: open the app directly, optionally at a stay stage.
  function skip(then) {
    O.flow = "login"; O.i = 1; O.skipPost = true; O.busy = "login-go"; afterEnter = then || null;
    quiet = true;
    syncChrome(); place(); el.hidden = false; el.innerHTML = ""; // a blank cover, not the login screen
    A.skipToApp();
  }
  function fromHash() {
    const h = (location.hash || "").slice(1);
    if (h === "owner" || h === "sitter") { O.role = h; O.flow = h; O.i = 2; render(); }
    else if (h === "login") { O.flow = "login"; O.i = 1; render(); }
    else if (h === "app") skip();
    else if (h === "splash") skip(() => A.splash());
    else if (h === "care" || h === "check" || /^stage-[1-5]$/.test(h)) {
      const target = /^stage-/.test(h) ? Number(h.slice(6)) - 1 : h;
      skip(() => Journey.jump(target));
    }
  }

  function init(adapter) {
    A = adapter;
    origDots = A.dots.innerHTML;
    el = document.createElement("div");
    el.className = "jr ob"; el.id = "obLayer";
    A.phone.appendChild(el);
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-ob]");
      if (!b || b.disabled) return;
      handle(b.dataset.ob, b.dataset.v, b);
    });
    el.addEventListener("input", onInput);
    el.addEventListener("keydown", (e) => {
      if (e.target.id === "obAdd" && (e.key === "Enter" || e.key === "Escape")) {
        e.preventDefault(); handle(e.key === "Enter" ? "tag-save" : "tag-cancel", O.health.adding); return;
      }
      if (e.key === "Enter" && e.target.tagName === "INPUT") { const p = el.querySelector(".ob-foot .btn-primary:not([disabled])"); if (p) p.click(); }
    });
    // While onboarding runs, the top bar's Back belongs to this layer (except on the concept's Look step).
    A.backBtn.addEventListener("click", (e) => {
      if (!O || !O.active || key() === "look") return;
      e.stopImmediatePropagation(); e.preventDefault();
      back();
    }, true);
    window.addEventListener("resize", () => { if (O && O.active && !el.hidden) place(); });
    // The flow viewer can replay the splash on demand.
    window.addEventListener("message", (e) => { if (e.data === "pawnote:splash") A.splash(); });
    O = fresh();
    render();
    fromHash();
  }

  return {init, step, after, reset, active: () => !!(O && O.active), quiet: () => quiet, flow: () => (O ? O.flow : "owner")};
})();
