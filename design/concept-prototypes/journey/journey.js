/* ==========================================================================
   Journey layer: the README's 5 stages, shared by all three concepts.
   ① Inquiry → ② Meet & Greet → ③ Booking → ④ Care & Pet Transit → ⑤ Completion
   Each concept calls Journey.init(adapter) once; the adapter supplies its own
   tab switching, toast, celebration and pet data, so the same features render
   in each concept's own style. Anything Lucy (the sitter) would do is a clearly
   marked "Demo · as Lucy" control. Demo only: no real AI, payment or GPS.
   ========================================================================== */
const Journey = (() => {
  const SITTER = "Lucy";
  let OWNER = "Chloe";
  let ALLERGY = "chicken"; // from onboarding; null = no known allergies
  const STAGES = [
    {key: "inquiry", title: "Inquiry", when: "Mon 10:40 PM"},
    {key: "meet", title: "Meet & Greet", when: "Tue"},
    {key: "booking", title: "Booking", when: "Wed"},
    {key: "care", title: "Pick-up & care", when: "Fri 7:30 AM"},
    {key: "done", title: "Home & review", when: "Mon 5:00 PM"},
  ];
  // Lucy's rates (03C formula): nights × rate, extra pet %, holiday % on holiday days in the stay.
  const RATES = {boarding: 55, house_sitting: 70, extraPetPct: 50, holidayPct: 25};
  const STAY = {from: "Oct 9", to: "Oct 12", nights: 3, holiday: "Thanksgiving (Oct 12)", holidayDays: 1};
  const CONSENTS = [
    {k: "vet", t: "24-hour emergency vet", s: `${SITTER} may take your pet to the nearest 24-hour vet if needed. You'll be called first; costs up to $500 are pre-approved.`},
    {k: "access", t: "Lockbox and buzzer use", s: `${SITTER} may use your lockbox code and condo buzzer only during the booked visits.`},
    {k: "cohab", t: "Sharing space with other pets", s: `Your pet may share ${SITTER}'s home with up to 2 other calm, vaccinated pets.`},
    {k: "handoff", t: "Handoff rules", s: "Drop-off and pick-up happen at the agreed time and place. Changes go through the app."},
    {k: "return", t: "Safe return", s: "If nobody is home at pick-up, your pet stays with the sitter until you confirm a new time."},
  ];
  const DEFAULT_REQUEST = (n) =>
    `8 AM — 1 cup of kibble\n2 PM — skin pill hidden in a treat\nEvening walk 20 min, harness on\nNo knocking — text me\nKeep other dogs away on walks`;

  let A = null; // adapter
  let J = null; // journey state
  let tripTimer = null, codeTimer = null;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const pet = () => A.petName();
  const isDog = () => A.species() === "dog";
  const second = () => (isDog() ? {name: "Mochi", species: "cat", emoji: "🐱"} : {name: "Coco", species: "dog", emoji: "🐶"});
  const money = (n) => `$${n.toFixed(2)}`;
  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fresh(returning) {
    return {
      stage: 0, unlocked: false, complete: false, returning: !!returning,
      inq: {service: "boarding", second: false, question: `Can ${pet()} take her pill in a treat?`, status: "form"},
      meet: {request: DEFAULT_REQUEST(), status: "write", checklist: [], heads: [], mode: "video", slot: 0, mg: "none",
        dropoff: "sitter", pickup: "owner"},
      book: {status: "waiting", consents: new Set(), open: new Set(), name: "", entry: "locked", codeShown: false},
      trip: {phase: "idle", eta: 12, progress: 0, zoom: 1},
      check: {status: "idle", photos: new Set([0, 2]), off: new Set(), note: ""},
      home: {phase: "idle", eta: 15, progress: 0, zoom: 1, stars: 0, thanks: "", review: false, record: "none"},
      notes: [],
    };
  }

  // ---------- quote (server-side in the real app; mirrored here for the demo) ----------
  function quote() {
    const rate = RATES[J.inq.service];
    const pets = J.inq.second ? 2 : 1;
    const base = rate * STAY.nights;
    const extraRate = rate * RATES.extraPetPct / 100;
    const extra = extraRate * (pets - 1) * STAY.nights;
    const holiday = Math.round((rate + extraRate * (pets - 1)) * RATES.holidayPct) / 100 * STAY.holidayDays;
    const total = Math.round((base + extra + holiday) * 100) / 100;
    return {rate, pets, base, extra, holiday: Math.round(holiday * 100) / 100, total};
  }
  function quoteHTML() {
    const q = quote();
    return `<div class="jr-quote" data-testid="jr-quote">
      <div><span>${STAY.nights} nights × ${money(q.rate)}</span><span>${money(q.base)}</span></div>
      ${q.pets > 1 ? `<div><span>Extra pet (${second().name}, ${RATES.extraPetPct}%)</span><span>+${money(q.extra)}</span></div>` : ""}
      <div><span>${STAY.holiday} +${RATES.holidayPct}%</span><span>+${money(q.holiday)}</span></div>
      <div class="total"><span>Total</span><span data-testid="jr-total">${money(q.total)} CAD</span></div>
    </div>`;
  }

  // ---------- notifications ----------
  function notify(title, when) {
    J.notes.unshift({title, when: when || STAGES[Math.min(J.stage, 4)].when, read: false});
    syncBell();
  }
  function syncBell() {
    const dot = document.getElementById("jrBellDot");
    if (dot) dot.hidden = !J.notes.some((n) => !n.read);
  }
  function openNotes() {
    const o = document.getElementById("jrOverlay");
    o.innerHTML = `<div class="jr-sheet jr" role="dialog" aria-modal="true" aria-label="Notifications">
      <div class="jr-spread"><h3 class="jr-h3">Updates</h3><button type="button" class="btn btn-secondary btn-sm" data-jr="close-sheet" style="width:auto">Close</button></div>
      ${J.notes.length ? J.notes.map((n) => `<div class="jr-note${n.read ? "" : " unread"}"><span aria-hidden="true">🐾</span><div><b>${esc(n.title)}</b><small>${esc(n.when)}</small></div></div>`).join("")
        : `<p class="jr-p">Nothing yet. Updates from ${SITTER} and PawNote land here, so you never need to ask.</p>`}
    </div>`;
    o.hidden = false;
    J.notes.forEach((n) => (n.read = true));
    syncBell();
  }

  // ---------- stage rendering ----------
  function stageSummary(i) {
    const q = quote();
    return [
      `${J.inq.service === "boarding" ? "Boarding" : "House sitting"} · ${STAY.from}–${STAY.to} · ${money(q.total)}`,
      `Checklist saved · ${J.meet.mode === "video" ? "Video" : "In-person"} Meet & Greet`,
      `Paid ${money(q.total)} · 5 consents signed`,
      `Picked up · photo verified`,
      `${pet()} is home safe · ${J.home.stars}★`,
    ][i];
  }

  function render() {
    if (!A || !J) return;
    const n = pet();
    const done = J.complete;
    A.stayMount.innerHTML = `<div class="jr jr-stay">
      <div class="jr-head">
        <span class="jr-eyebrow">${J.returning ? "Next stay · " : ""}Thanksgiving · ${STAY.from}–${STAY.to}</span>
        <h1 class="jr-title">${esc(n)}'s stay with ${SITTER}</h1>
        <p class="jr-sub">${done ? "Stay complete. Everything Lucy learned is saved for next time." : "Five steps from the first question to the ride home."}</p>
      </div>
      ${STAGES.map((s, i) => {
        const cls = i < J.stage || (J.complete && i === 4) ? "is-done" : i === J.stage ? "is-current" : "is-future";
        return `<section class="jr-stage ${cls}" data-testid="jr-stage-${s.key}" aria-current="${i === J.stage ? "step" : "false"}">
          <div class="jr-stage-head"><span class="jr-num" aria-hidden="true">${cls === "is-done" ? "✓" : i + 1}</span>
            <span class="jr-stage-title"><b>${s.title}</b><span>${cls === "is-done" ? esc(stageSummary(i)) : s.when}</span></span></div>
          ${i === J.stage ? `<div class="jr-stage-body">${[inquiry, meet, booking, care, completion][i]()}</div>` : ""}
        </section>`;
      }).join("")}
    </div>`;
    renderGates();
    if (["driving", "arrived"].includes(J.trip.phase) || ["driving", "arrived"].includes(J.home.phase)) placeCar();
  }

  function demo(label, action, extra = "") {
    return `<button type="button" class="btn btn-secondary jr-demo ${extra}" data-jr="${action}">${label}</button>`;
  }
  function primary(label, action, disabled) {
    return `<button type="button" class="btn btn-primary" data-jr="${action}"${disabled ? " disabled" : ""}>${label}</button>`;
  }
  function secondaryBtn(label, action) {
    return `<button type="button" class="btn btn-secondary" data-jr="${action}">${label}</button>`;
  }
  function chip(label, action, on, value) {
    return `<button type="button" class="chip${on ? " active" : ""}" data-jr="${action}" data-v="${value}" aria-pressed="${on}">${label}</button>`;
  }

  // ① Inquiry
  function inquiry() {
    const s = J.inq, n = pet();
    const ask = `<div class="jr-stack"><span class="jr-label">Service</span><div class="jr-chips">
        ${chip("🏠 Boarding", "service", s.service === "boarding", "boarding")}${chip("🔑 House sitting", "service", s.service === "house_sitting", "house_sitting")}</div>
        <p class="jr-p">${s.service === "boarding" ? `${n} stays at ${SITTER}'s home.` : `${SITTER} looks after ${n} at your home.`}</p></div>
      <div class="jr-stack"><span class="jr-label">Dates</span><div class="jr-chips"><span class="chip active" aria-disabled="true">${STAY.from} → ${STAY.to} · ${STAY.nights} nights</span></div></div>
      <div class="jr-stack"><span class="jr-label">Pets</span><div class="jr-chips">
        <span class="chip active" aria-disabled="true">${isDog() ? "🐶" : "🐱"} ${esc(n)}</span>
        ${chip(`${second().emoji} ${second().name}`, "second", s.second, "1")}</div>
        <p class="jr-p">Their profiles (breed, age, allergies) go with your question${J.returning ? ", plus the Life Record from the last stay" : ""}.</p></div>
      <label class="jr-stack"><span class="jr-label">Your question (optional)</span>
        <input class="input" id="jrQuestion" value="${esc(s.question)}" placeholder="e.g. Can she take her pill in a treat?"></label>`;
    if (s.status === "form") return `${ask}${primary(`Ask ${SITTER}`, "ask")}`;
    const thread = `<div class="jr-thread">
      <div class="jr-bubble me">${esc(s.question || `Is ${SITTER} free ${STAY.from}–${STAY.to}?`)}</div>
      ${s.status === "sending"
        ? `<div class="jr-typing"><span class="jr-dots"><i></i><i></i><i></i></span>PawNote AI is replying for ${SITTER}…</div>`
        : `<div class="jr-bubble ai" data-testid="jr-ai-reply"><div class="jr-ai-label">✦ Auto-reply from ${SITTER}'s PawNote assistant</div>
            Hi ${OWNER}! ${SITTER} is free ${STAY.from}–${STAY.to} for ${esc(n)}${J.inq.second ? ` and ${second().name}` : ""}.
            ${esc(n)} can take the pill in a treat — ${SITTER} does that for other pets every day.
            ${J.returning ? `${SITTER} already has ${esc(n)}'s Life Record from the last stay. ` : ""}Here's the total, including the ${STAY.holiday.split(" ")[0]} rate:
            <div style="margin-top:.625rem">${quoteHTML()}</div>
            <div class="jr-src"><span>From ${SITTER}'s calendar</span><span>From ${SITTER}'s house policy</span>${J.returning ? `<span>From ${esc(n)}'s Life Record</span>` : ""}</div>
          </div>`}
    </div>`;
    if (s.status === "sending") return thread;
    return `${thread}<p class="jr-p">Prices come from ${SITTER}'s rates, never from the AI — checkout shows the same numbers.</p>
      ${primary("Request booking", "request")}`;
  }

  // ② Meet & Greet
  function meet() {
    const s = J.meet, n = pet();
    let out = `<div class="jr-stack"><span class="jr-label">Care & medication request</span>
      <p class="jr-p">Write it like a note. PawNote turns it into ${SITTER}'s checklist; you review it first.</p>`;
    if (s.status === "write" || s.status === "generating") {
      out += `<textarea class="input jr-textarea" id="jrRequest" aria-label="Care and medication request">${esc(s.request)}</textarea></div>
        <button type="button" class="btn btn-primary" data-jr="generate"${s.status === "generating" ? " disabled" : ""}>${s.status === "generating" ? `<span class="spinner" aria-hidden="true"></span>Making the checklist…` : "Turn into checklist"}</button>`;
      return out;
    }
    out += `</div><div class="jr-card" data-testid="jr-checklist"><div class="jr-spread"><h3 class="jr-h3">${esc(n)}'s checklist</h3><span class="jr-demo-tag">AI draft · edit freely</span></div>
      ${s.checklist.map((r, i) => `<div class="jr-check"><input class="input" data-jr-edit="time" data-i="${i}" value="${esc(r.time)}" aria-label="Time">
        <input class="input" data-jr-edit="title" data-i="${i}" value="${esc(r.title)}" aria-label="Task"><button type="button" class="jr-x" data-jr="remove-row" data-v="${i}" aria-label="Remove ${esc(r.title)}">✕</button></div>`).join("")}
      <div class="jr-stack"><span class="jr-label">Heads-up for ${SITTER}</span><div class="jr-heads">${s.heads.map((h) => `<span>⚠️ ${esc(h)}</span>`).join("")}</div></div>
    </div>
    <div class="jr-divider"></div>
    <div class="jr-stack"><span class="jr-label">Meet & Greet</span>
      <div class="jr-chips">${chip("📹 Video", "mode", s.mode === "video", "video")}${chip("🤝 In person", "mode", s.mode === "in_person", "in_person")}</div>
      <div class="jr-chips">${["Tue 7:00 PM", "Wed 6:30 PM"].map((t, i) => chip(t, "slot", s.slot === i, i)).join("")}</div>
      ${s.mg === "none" ? secondaryBtn("Propose this time", "propose")
        : s.mg === "proposed" ? `<p class="jr-p">Waiting for ${SITTER} to confirm.</p>${demo(`${SITTER} confirms`, "mg-accept")}`
        : `<p class="jr-ok">✓ ${s.mode === "video" ? "Video" : "In person"} · ${["Tue 7:00 PM", "Wed 6:30 PM"][s.slot]} — confirmed</p>`}
    </div>
    <div class="jr-divider"></div>
    <div class="jr-stack"><span class="jr-label">Who drives?</span>
      <div class="jr-spread"><span class="jr-p">Drop-off</span><div class="jr-chips">${chip("You", "dropoff", s.dropoff === "owner", "owner")}${chip(SITTER, "dropoff", s.dropoff === "sitter", "sitter")}</div></div>
      <div class="jr-spread"><span class="jr-p">Pick-up home</span><div class="jr-chips">${chip("You", "pickup", s.pickup === "owner", "owner")}${chip(SITTER, "pickup", s.pickup === "sitter", "sitter")}</div></div>
    </div>
    ${primary("Continue to booking", "meet-done", s.mg !== "agreed")}
    ${s.mg !== "agreed" ? `<p class="jr-p" style="text-align:center">Confirm the Meet & Greet to continue.</p>` : ""}`;
    return out;
  }

  // ③ Booking
  function booking() {
    const s = J.book, n = pet(), q = quote();
    if (s.status === "waiting")
      return `<p class="jr-p">Request sent. ${SITTER} sees ${esc(n)}'s profile, the checklist and the quote.</p>${demo(`${SITTER} accepts`, "accept")}`;
    if (s.status === "accepted" || s.status === "paying") {
      const all = s.consents.size === CONSENTS.length;
      const ready = all && s.name.trim().length > 1;
      return `<p class="jr-ok">✓ ${SITTER} accepted — finish booking</p>
        <div class="jr-card">${quoteHTML()}</div>
        <div class="jr-stack"><span class="jr-label">Consents (${s.consents.size}/${CONSENTS.length})</span>
          ${CONSENTS.map((c) => `<div class="jr-consent"><label><input type="checkbox" data-jr-consent="${c.k}"${s.consents.has(c.k) ? " checked" : ""}>${c.t}</label>
            <p>${s.open.has(c.k) ? esc(c.s) + " This is a demo template written for PawNote; it is not legal advice." : esc(c.s.split(".")[0]) + "."}</p>
            <button type="button" class="jr-link" data-jr="read" data-v="${c.k}">${s.open.has(c.k) ? "Show less" : "Read full text"}</button></div>`).join("")}
          <p class="jr-legal">Demo template — not legal advice.</p></div>
        <label class="jr-stack"><span class="jr-label">Type your full name to sign</span>
          <input class="input" id="jrSign" value="${esc(s.name)}" placeholder="e.g. Chloe Park" autocomplete="name"></label>
        <button type="button" class="btn btn-primary" data-jr="pay" id="jrPay"${ready && s.status !== "paying" ? "" : " disabled"}>${s.status === "paying" ? `<span class="spinner" aria-hidden="true"></span>Paying…` : `Pay ${money(q.total)} (demo)`}</button>
        <p class="jr-p" style="text-align:center">Demo payment — no card needed.</p>`;
    }
    // paid
    const sitterHome = J.inq.service === "boarding";
    const ownerHomeNeeded = J.inq.service === "house_sitting" || J.meet.dropoff === "sitter";
    return `<p class="jr-ok">✓ You're all set — ${money(q.total)} paid</p>
      ${sitterHome ? `<div class="jr-card jr-unlocked"><h3 class="jr-h3">🔓 ${SITTER}'s place</h3>
        <p class="jr-p">88 Willow Ave, Unit 4 · Visitor parking P2, spot 14 (demo address)</p>
        <span class="jr-label">Packing list</span><div class="jr-chips">${["Food", "Bed or cushion", "Medications", "Leash", "Favorite toy"].map((x) => `<span class="chip">${x}</span>`).join("")}</div></div>` : ""}
      ${ownerHomeNeeded ? `<div class="jr-card" data-testid="jr-entry"><div class="jr-lock"><span class="jr-lock-ico" aria-hidden="true">${s.entry === "locked" ? "🔒" : "🔓"}</span>
        <div class="jr-stack"><h3 class="jr-h3">Entry info for ${SITTER}</h3>
        ${s.entry === "locked"
          ? `<p class="jr-p">Your lockbox code unlocks for ${SITTER} Fri 5:30 AM — 2 hours before the pick-up — and you'll be told when it opens.</p>${demo("Jump to 2 hours before", "unlock", "jr-demo-owner")}`
          : `<p class="jr-p">Open for ${SITTER} until the stay ends. Never shown in a notification.</p>
             ${s.codeShown ? `<div class="jr-code" data-testid="jr-code">4 8 2 1</div><p class="jr-p">Hides again in 10 seconds.</p>` : secondaryBtn("Show code", "show-code")}`}
        </div></div></div>` : ""}
      ${primary("Go to pick-up day", "booking-done")}`;
  }

  // ④ Pick-up & care
  function mapHTML(t, who) {
    return `<div class="jr-card"><div class="jr-spread"><span class="jr-sharing">Sharing location until arrival</span><span class="jr-p">${who}</span></div>
      <div class="jr-map"><svg viewBox="0 0 320 180" id="jrMapSvg" style="transform:scale(${t.zoom})" role="img" aria-label="Trip map">
        <g stroke="var(--tint-border)" stroke-width="8" fill="none" stroke-linecap="round"><path d="M0 60H320M0 130H320M80 0V180M220 0V180"/></g>
        <path id="jrRoute" d="M30 150 C 90 150, 80 60, 150 60 S 260 70, 290 30" fill="none" stroke="var(--primary)" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 9"/>
        <circle cx="30" cy="150" r="7" fill="var(--text-muted)"/><circle cx="290" cy="30" r="8" fill="var(--primary)"/>
        <g id="jrCar"><circle r="11" fill="var(--primary)" stroke="#fff" stroke-width="3"/><text y="5" text-anchor="middle" font-size="12">🚗</text></g>
      </svg>
      <div class="jr-zoom"><button type="button" data-jr="zoom" data-v="1" aria-label="Zoom in">+</button><button type="button" data-jr="zoom" data-v="-1" aria-label="Zoom out">−</button></div></div>
      <div class="jr-eta"><b id="jrEta">${t.eta > 0 ? `${t.eta} min` : "Arrived"}</b><span class="jr-p">${t.eta > 0 ? "ETA · live" : "Location sharing stopped"}</span></div></div>`;
  }
  function care() {
    const t = J.trip, n = pet(), sitterDrives = J.meet.dropoff === "sitter";
    const who = sitterDrives ? `${SITTER} is driving to you` : `You're driving to ${SITTER}'s`;
    if (t.phase === "idle")
      return `<p class="jr-p">${sitterDrives ? `${SITTER} picks ${esc(n)} up at 7:30 AM. You'll watch the trip live.` : `You drop ${esc(n)} off at ${SITTER}'s at 7:30 AM.`}</p>
        ${sitterDrives ? demo(`${SITTER} starts the drive`, "trip-start") : primary("Start the drive", "trip-start")}`;
    if (t.phase === "driving")
      return `${mapHTML(t, who)}${secondaryBtn("Simulate the drive", "trip-skip")}`;
    if (t.phase === "arrived")
      return `${mapHTML(t, who)}<div class="jr-card"><h3 class="jr-h3">${sitterDrives ? `${SITTER} is here` : `You're at ${SITTER}'s`}</h3>
        <p class="jr-p">${sitterDrives ? `${SITTER} has your buzzer card. Hand ${esc(n)} over at the door.` : "Visitor parking P2, spot 14. Buzz 104."}</p></div>
        ${demo(`${SITTER} snaps the handoff photo`, "handoff")}`;
    if (t.phase === "checking")
      return `<div class="jr-typing"><span class="jr-dots"><i></i><i></i><i></i></span>Checking the handoff photo…</div>`;
    return `<div class="jr-card"><div class="jr-photo"><img src="${A.photo()}" alt="Handoff photo of ${esc(n)}">
        <div class="jr-pass"><span>✓ ${esc(n)} is in the photo</span><span>✓ Crate secured in the car</span><span class="jr-p">Checked by MiniCPM-V</span></div></div></div>
      <p class="jr-ok">Pick-up complete — care has started · photo verified</p>
      <div class="jr-stack"><span class="jr-label">While ${esc(n)} is with ${SITTER}</span>
        ${secondaryBtn("Open today's updates", "go-home")}
        ${J.check.status === "idle" ? demo(`${SITTER} does the 5-second check`, "check-open") : ""}
        ${demo(`${SITTER} scans a new treat`, "treat")}</div>
      ${J.check.status === "idle" ? "" : checkHTML()}
      ${primary(`Bring ${esc(n)} home`, "care-done")}`;
  }

  // ⑤ Home & review
  function completion() {
    const h = J.home, n = pet(), ownerDrives = J.meet.pickup === "owner";
    if (h.phase === "idle")
      return `<p class="jr-p">${ownerDrives ? `You pick ${esc(n)} up at 5:00 PM. ${SITTER} sees your ETA.` : `${SITTER} brings ${esc(n)} home at 5:00 PM.`}</p>
        ${ownerDrives ? primary("Start the drive", "home-start") : demo(`${SITTER} starts the drive`, "home-start")}`;
    if (h.phase === "driving")
      return `${mapHTML(h, ownerDrives ? `You're driving to ${SITTER}'s` : `${SITTER} is driving to you`)}${secondaryBtn("Simulate the drive", "home-skip")}`;
    if (h.phase === "arrived")
      return `${mapHTML(h, ownerDrives ? `You're at ${SITTER}'s` : `${SITTER} is here`)}<div class="jr-card"><h3 class="jr-h3">${ownerDrives ? `You're at ${SITTER}'s` : `${SITTER} is here`}</h3>
        <p class="jr-p">Visitor parking P2, spot 14.</p></div>${demo(`${SITTER} snaps the return photo`, "return")}`;
    let out = `<div class="jr-card"><div class="jr-photo"><img src="${A.photo()}" alt="${esc(n)} home safe">
      <div class="jr-stack"><h3 class="jr-h3">${esc(n)} is home safe 🏠</h3><span class="jr-p">Return photo verified · ${STAGES[4].when}</span></div></div></div>`;
    if (!h.review)
      return out + `<div class="jr-stack"><span class="jr-label">How was ${SITTER}?</span>
        <div class="jr-stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="${i <= h.stars ? "on" : ""}" data-jr="star" data-v="${i}" role="radio" aria-checked="${i === h.stars}" aria-label="${i} star${i > 1 ? "s" : ""}">★</button>`).join("")}</div>
        <div class="jr-chips">${[`Thank you, ${SITTER}!`, `${n} loved it`, "Great photos"].map((t) => chip(t, "thanks", h.thanks === t, t)).join("")}</div></div>
        ${primary("Send review", "review", h.stars === 0)}`;
    if (h.record !== "ready")
      return out + `<p class="jr-ok">✓ Review sent to ${SITTER}</p><div class="jr-typing"><span class="jr-dots"><i></i><i></i><i></i></span>Writing ${esc(n)}'s Life Record…</div>`;
    const src = `From ${SITTER} · ${STAY.from}–${STAY.to}`;
    return out + `<p class="jr-ok">✓ Review sent to ${SITTER}</p>
      <div class="jr-card" data-testid="jr-record"><div class="jr-spread"><h3 class="jr-h3">${esc(n)}'s Life Record</h3><span class="jr-demo-tag">Only recorded facts</span></div>
        <div class="jr-record">
          <div><b>Eats</b><p>Finishes 1 cup of kibble at 8 AM; eats faster with a warm-water splash.</p><small>${src}</small></div>
          <div><b>Meds</b><p>Takes the skin pill best hidden in a treat.</p><small>${src}</small></div>
          <div><b>Potty</b><p>Regular after breakfast and the evening walk.</p><small>${src}</small></div>
          <div><b>Behavior</b><p>Calm indoors; excited by squirrels on walks.</p><small>${src}</small></div>
          <div><b>Heads-up</b><p>${ALLERGY ? `Allergic to ${esc(ALLERGY)} — check treat labels${ALLERGY === "chicken" ? ' for "animal fat"' : ""}.` : "No known allergies — Treat Guard still checks every new label."}</p><small>From your profile · Treat Guard</small></div>
          <div><b>Sitter tips</b><p>Harness on before the door opens; text, don't knock.</p><small>From your care request</small></div>
        </div></div>
      <p class="jr-p">The next sitter's checklist and AI replies start from this.</p>
      ${primary("Plan the next stay", "again")}`;
  }

  // ---------- 5-second check (DESIGN.md §7.2): ≤ 2 photos → AI chips → optional note → Generate → Send ----------
  const CHECK_CHIPS = () => [
    {k: "meal", t: "🍽️ Breakfast"}, {k: "meds", t: "💊 Pill in a treat"}, {k: "walk", t: "🦮 Walk 20 min"},
    {k: "potty", t: "💩 Potty normal"}, {k: "squirrel", t: "🐿️ Squirrel"}, {k: "nap", t: "😴 Long nap"},
  ];
  const CROPS = ["50% 30%", "30% 60%", "70% 45%", "50% 80%"];
  function dailyNote() {
    const c = J.check, on = (k) => !c.off.has(k), n = pet();
    const parts = [];
    if (on("meal")) parts.push(`${n} finished every bit of her breakfast`);
    if (on("meds")) parts.push("took her skin pill tucked in a treat");
    if (on("walk")) parts.push(`we did a 20-minute walk${on("squirrel") ? " — she spotted a squirrel at the park and got so excited 🐿️" : ""}`);
    let text = parts.length ? `${parts.join(", ").replace(/, ([^,]*)$/, ", and $1")}!` : `${n} had a calm day with me.`;
    if (on("potty")) text += " Her potty was perfectly healthy, too.";
    if (on("nap")) text += " She's napping on her blanket now.";
    if (c.note.trim()) text += ` ${c.note.trim()}`;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function checkHTML() {
    const c = J.check, n = pet();
    const head = `<div class="jr-spread"><h3 class="jr-h3">5-second check</h3><span class="jr-demo-tag">Demo · as ${SITTER}</span></div>`;
    if (c.status === "sent")
      return `<div class="jr-card jr-unlocked" data-testid="jr-check">${head}<p class="jr-ok">✓ Daily note sent to ${OWNER} · 6:04 PM</p>
        <p class="jr-p">“${esc(dailyNote())}”</p></div>`;
    if (c.status === "generating")
      return `<div class="jr-card" data-testid="jr-check">${head}<div class="jr-typing"><span class="jr-dots"><i></i><i></i><i></i></span>Writing ${esc(n)}'s daily note in ${SITTER}'s voice…</div></div>`;
    if (c.status === "review")
      return `<div class="jr-card" data-testid="jr-check">${head}
        <div class="jr-bubble ai" style="max-width:100%"><div class="jr-ai-label">✦ Draft · only from the chips and note</div>${esc(dailyNote())}</div>
        <div class="jr-shots jr-shots-sm">${[...c.photos].map((i) => `<img src="${A.photo()}" alt="" style="object-position:${CROPS[i]}">`).join("")}</div>
        ${primary(`Send to ${OWNER}`, "check-send")}
        <button type="button" class="jr-link" style="margin:0;align-self:center" data-jr="check-back">Change chips or note</button></div>`;
    return `<div class="jr-card" data-testid="jr-check">${head}
      <div class="jr-stack"><span class="jr-label">Photos (${c.photos.size}/2)</span>
        <div class="jr-shots">${CROPS.map((pos, i) => `<button type="button" class="jr-shot${c.photos.has(i) ? " on" : ""}" data-jr="check-photo" data-v="${i}" aria-pressed="${c.photos.has(i)}" aria-label="Photo ${i + 1}"><img src="${A.photo()}" alt="" style="object-position:${pos}"></button>`).join("")}</div></div>
      <div class="jr-stack"><span class="jr-label">✦ Suggested from today (6:00 PM) · tap to turn off</span>
        <div class="jr-chips jr-check-chips">${CHECK_CHIPS().map((x) => `<button type="button" class="chip${c.off.has(x.k) ? " jr-off" : " active"}" data-jr="check-chip" data-v="${x.k}" aria-pressed="${!c.off.has(x.k)}">${x.t}</button>`).join("")}</div></div>
      <label class="jr-stack"><span class="jr-spread"><span class="jr-label">Short note (optional)</span><span class="jr-p" id="jrNoteCount">${c.note.length}/200</span></span>
        <input class="input" id="jrNote" maxlength="200" value="${esc(c.note)}" placeholder="e.g. She loved the new squeaky toy"></label>
      ${primary("Generate daily note", "check-generate", c.off.size === CHECK_CHIPS().length && !c.note.trim())}</div>`;
  }

  // ---------- trip animation ----------
  function placeCar() {
    const t = J.stage === 3 ? J.trip : J.home;
    const route = document.getElementById("jrRoute"), car = document.getElementById("jrCar");
    if (!route || !car) return;
    const pt = route.getPointAtLength(route.getTotalLength() * t.progress);
    car.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
    const eta = document.getElementById("jrEta");
    if (eta) eta.textContent = t.eta > 0 ? `${t.eta} min` : "Arrived";
  }
  function drive(t, total, onArrive) {
    clearInterval(tripTimer);
    t.phase = "driving"; t.eta = total; t.progress = 0;
    render();
    const step = reduce() ? 0.34 : 0.12;
    tripTimer = setInterval(() => {
      t.progress = Math.min(1, t.progress + step / total * 4);
      t.eta = Math.max(0, Math.round(total * (1 - t.progress)));
      placeCar();
      if (t.progress >= 1) { clearInterval(tripTimer); arrive(t, onArrive); }
    }, 250);
  }
  function arrive(t, onArrive) {
    clearInterval(tripTimer);
    t.progress = 1; t.eta = 0; t.phase = "arrived";
    onArrive();
    render();
  }

  // ---------- gates (Home / Feed / Care / Reports before care starts) ----------
  function renderGates() {
    const n = pet();
    (A.gated || []).forEach(({el, label}) => {
      if (!el) return;
      let g = el.querySelector(":scope > .jr-gate");
      if (!g) { g = document.createElement("div"); g.className = "jr-gate jr"; el.prepend(g); }
      el.classList.toggle("jr-locked", !J.unlocked);
      g.hidden = J.unlocked;
      g.innerHTML = J.unlocked ? "" : `<div class="jr-empty"><span class="emo" aria-hidden="true">🗓️</span>
        <h2 class="jr-h3">${label} starts when ${esc(n)} is with ${SITTER}</h2>
        <p class="jr-p">${STAGES[Math.min(J.stage, 4)].title} is next. Everything shows up here on its own after pick-up.</p>
        ${secondaryBtn("Open the stay", "go-stay")}</div>`;
    });
    if (A.homeMount) {
      let c = A.homeMount.querySelector(":scope > .jr-home");
      if (!c) { c = document.createElement("div"); c.className = "jr-gate jr jr-home"; A.homeMount.prepend(c); }
      A.homeMount.classList.toggle("jr-locked", !J.unlocked);
      const i = Math.min(J.stage, 4);
      c.innerHTML = J.complete ? `<div class="jr-card"><span class="jr-eyebrow">Stay complete</span><h2 class="jr-h3">${esc(n)} is home safe 🏠</h2>
          <p class="jr-p">Life Record saved for next time.</p>${secondaryBtn("Plan the next stay", "go-stay")}</div>`
        : J.unlocked ? `<button type="button" class="jr-card" data-jr="go-stay" style="text-align:left;cursor:pointer;font:inherit;color:inherit">
          <span class="jr-spread"><span class="jr-eyebrow">Stay · step ${i + 1} of 5</span><span class="jr-p">Open ›</span></span>
          <span class="jr-progress">${STAGES.map((_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</span></button>`
        : `<div class="jr-card"><span class="jr-eyebrow">${J.stage === 0 ? "Plan a stay" : `Stay · step ${i + 1} of 5`}</span>
          <h2 class="jr-h3">${J.stage === 0 ? `Going away? Ask ${SITTER} about ${STAY.from}–${STAY.to}` : `${STAGES[i].title} with ${SITTER}`}</h2>
          <span class="jr-progress">${STAGES.map((_, k) => `<i class="${k < i ? "on" : ""}"></i>`).join("")}</span>
          ${primary(J.stage === 0 ? `Ask ${SITTER}` : "Continue", "go-stay")}</div>`;
    }
  }

  // ---------- actions ----------
  function finishStage(kind) {
    J.stage += 1;
    render();
    const doneNums = A.stayMount.querySelectorAll(".is-done .jr-num");
    A.celebrate(kind, doneNums[doneNums.length - 1] || A.stayMount);
    const cur = A.stayMount.querySelector(".is-current");
    if (cur) cur.scrollIntoView({block: "nearest", behavior: reduce() ? "auto" : "smooth"});
  }
  function handle(act, v, el) {
    const s = J;
    switch (act) {
      case "service": s.inq.service = v; break;
      case "second": s.inq.second = !s.inq.second; break;
      case "ask":
        s.inq.question = (document.getElementById("jrQuestion") || {}).value || s.inq.question;
        s.inq.status = "sending"; render();
        setTimeout(() => { s.inq.status = "replied"; render(); notify(`${SITTER}'s assistant replied with a quote`); }, reduce() ? 300 : 1600);
        return;
      case "request": notify(`Booking request sent to ${SITTER}`); finishStage("stage"); return;
      case "generate":
        s.meet.request = (document.getElementById("jrRequest") || {}).value || s.meet.request;
        s.meet.status = "generating"; render();
        setTimeout(() => { buildChecklist(); s.meet.status = "done"; render(); }, reduce() ? 300 : 1400);
        return;
      case "remove-row": s.meet.checklist.splice(Number(v), 1); break;
      case "mode": s.meet.mode = v; break;
      case "slot": s.meet.slot = Number(v); break;
      case "propose": s.meet.mg = "proposed"; break;
      case "mg-accept": s.meet.mg = "agreed"; notify(`${SITTER} confirmed the Meet & Greet`); break;
      case "dropoff": s.meet.dropoff = v; break;
      case "pickup": s.meet.pickup = v; break;
      case "meet-done": finishStage("stage"); return;
      case "accept": s.book.status = "accepted"; notify(`${SITTER} accepted your booking 🎉`); A.toast(`${SITTER} accepted!`, "Sign the consents and pay to confirm."); break;
      case "read": s.book.open.has(v) ? s.book.open.delete(v) : s.book.open.add(v); break;
      case "pay":
        s.book.status = "paying"; render();
        setTimeout(() => {
          s.book.status = "paid"; notify(`Paid ${money(quote().total)} · ${SITTER}'s address unlocked`);
          A.toast("You're all set ✅", `${SITTER}'s address and parking are unlocked.`); render(); A.celebrate("pay", document.querySelector(".jr-ok"));
        }, reduce() ? 300 : 1200);
        return;
      case "unlock": s.book.entry = "unlocked"; notify(`Entry info unlocked for ${SITTER}`, "Fri 5:30 AM"); break;
      case "show-code":
        s.book.codeShown = true; clearTimeout(codeTimer);
        codeTimer = setTimeout(() => { s.book.codeShown = false; render(); }, 10000);
        break;
      case "booking-done": finishStage("stage"); return;
      case "trip-start":
        notify(J.meet.dropoff === "sitter" ? `${SITTER} is on the way` : "Trip started", "Fri 7:18 AM");
        drive(s.trip, 12, () => notify(J.meet.dropoff === "sitter" ? `${SITTER} has arrived` : `You arrived at ${SITTER}'s`, "Fri 7:30 AM"));
        return;
      case "trip-skip": arrive(s.trip, () => notify(`${SITTER} has arrived`, "Fri 7:30 AM")); return;
      case "handoff":
        s.trip.phase = "checking"; render();
        setTimeout(() => {
          s.trip.phase = "done"; s.unlocked = true; render();
          notify("Pick-up complete — care has started · photo verified", "Fri 7:32 AM");
          A.toast("Care has started", `${pet()} is with ${SITTER} · photo verified`);
          A.celebrate("unlock", A.stayMount.querySelector(".jr-ok"));
          if (A.onUnlock) A.onUnlock();
        }, reduce() ? 300 : 1300);
        return;
      case "go-home": A.goTab("home"); return;
      case "go-stay": A.goTab("stay"); return;
      case "treat": showDanger(); return;
      case "check-open": s.check.status = "open"; break;
      case "check-photo": {
        const i = Number(v), p = s.check.photos;
        if (p.has(i)) p.delete(i); else if (p.size < 2) p.add(i); else A.toast("Up to 2 photos", "Turn one off to pick another.");
        break;
      }
      case "check-chip": s.check.off.has(v) ? s.check.off.delete(v) : s.check.off.add(v); break;
      case "check-generate":
        s.check.status = "generating"; render();
        setTimeout(() => { s.check.status = "review"; render(); }, reduce() ? 300 : 1300);
        return;
      case "check-back": s.check.status = "open"; break;
      case "check-send":
        s.check.status = "sent"; notify(`${SITTER} sent ${pet()}'s daily note 📝`, "Fri 6:04 PM"); render();
        A.toast("Daily note sent", `${OWNER} gets it now.`);
        A.celebrate("stage", A.stayMount.querySelector('[data-testid="jr-check"] .jr-ok'));
        return;
      case "care-done": finishStage("stage"); return;
      case "home-start":
        notify(J.meet.pickup === "owner" ? `${SITTER} can see your ETA` : `${SITTER} is bringing ${pet()} home`, "Mon 4:45 PM");
        drive(s.home, 15, () => {});
        return;
      case "home-skip": arrive(s.home, () => {}); return;
      case "return":
        s.home.phase = "home"; notify(`${pet()} is home safe 🏠`, "Mon 5:02 PM");
        render(); A.celebrate("home", A.stayMount.querySelector(".jr-photo"));
        return;
      case "star": s.home.stars = Number(v); break;
      case "thanks": s.home.thanks = s.home.thanks === v ? "" : v; break;
      case "review":
        s.home.review = true; s.home.record = "writing"; render();
        setTimeout(() => {
          s.home.record = "ready"; s.complete = true; render(); notify(`${pet()}'s Life Record is saved`, "Mon 5:10 PM");
          A.celebrate("record", A.stayMount.querySelector('[data-testid="jr-record"]'));
        }, reduce() ? 300 : 1500);
        return;
      case "again": J = Object.assign(fresh(true), {notes: J.notes, unlocked: false}); break;
      case "zoom": { const t = J.stage === 3 ? s.trip : s.home; t.zoom = Math.min(1.6, Math.max(1, t.zoom + Number(v) * 0.3));
        const svg = document.getElementById("jrMapSvg"); if (svg) svg.style.transform = `scale(${t.zoom})`; return; }
      case "close-sheet": document.getElementById("jrOverlay").hidden = true; return;
      default: return;
    }
    render();
  }

  function buildChecklist() {
    const lines = J.meet.request.split("\n").map((l) => l.trim()).filter(Boolean);
    const rows = [], heads = [];
    lines.forEach((l) => {
      const m = l.match(/^(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*[—-]\s*(.+)$/i);
      if (m) rows.push({time: m[1].toUpperCase().replace(/\s+/, " "), title: m[2]});
      else if (/^(no |keep |don't|do not|never)/i.test(l)) heads.push(l);
      else if (/walk/i.test(l)) rows.push({time: "6:00 PM", title: l});
      else heads.push(l);
    });
    J.meet.checklist = rows.length ? rows : [{time: "8:00 AM", title: "Breakfast"}];
    J.meet.heads = heads;
  }

  function showDanger() {
    const n = pet();
    const bad = ALLERGY || (isDog() ? "xylitol" : "onion powder");
    const d = document.getElementById("jrDanger");
    d.innerHTML = `<div class="jr-danger-head"><b>⚠️ DANGER</b><h2>Don't feed this treat to ${esc(n)}</h2></div>
      <div class="jr-danger-body jr"><p class="jr-p" style="font-size:1rem;color:var(--text)">"Chewy Chompers" contains <b>${esc(bad)}</b> — ${ALLERGY ? `${esc(n)} is allergic (from ${esc(n)}'s profile)` : `toxic to ${isDog() ? "dogs" : "cats"}`}.</p>
        <div class="tags"><span>${esc(bad)}</span>${ALLERGY === "chicken" ? "<span>animal fat (may contain chicken)</span>" : ""}</div>
        <p class="jr-p">Read from the label photo by MiniCPM-V, checked by Nemotron Ultra. ${OWNER} has been notified.</p></div>
      <div class="jr-danger-foot"><button type="button" class="btn btn-primary btn-danger" data-jr="danger-ok">I understand — don't feed</button></div>`;
    d.hidden = false;
    notify(`Blocked a risky treat for ${n} ⚠️`, "Sat 3:10 PM");
    d.querySelector("button").focus();
  }

  // ---------- wiring ----------
  function onClick(e) {
    const b = e.target.closest("[data-jr]");
    if (!b) return;
    if (b.dataset.jr === "danger-ok") { document.getElementById("jrDanger").hidden = true; A.toast("Treat set aside", `${SITTER} won't feed it.`); return; }
    if (b.disabled) return;
    handle(b.dataset.jr, b.dataset.v, b);
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === "jrSign") { J.book.name = t.value; syncPay(); }
    if (t.id === "jrQuestion") J.inq.question = t.value;
    if (t.id === "jrRequest") J.meet.request = t.value;
    if (t.id === "jrNote") {
      J.check.note = t.value;
      const c = document.getElementById("jrNoteCount"); if (c) c.textContent = `${t.value.length}/200`;
      const g = A.stayMount.querySelector('[data-jr="check-generate"]');
      if (g) g.disabled = J.check.off.size === CHECK_CHIPS().length && !t.value.trim();
    }
    if (t.dataset && t.dataset.jrEdit) J.meet.checklist[Number(t.dataset.i)][t.dataset.jrEdit] = t.value;
  }
  function onChange(e) {
    const k = e.target.dataset && e.target.dataset.jrConsent;
    if (!k) return;
    e.target.checked ? J.book.consents.add(k) : J.book.consents.delete(k);
    const lbl = A.stayMount.querySelector(".jr-stage.is-current .jr-label");
    if (lbl) lbl.textContent = `Consents (${J.book.consents.size}/${CONSENTS.length})`;
    syncPay();
  }
  function syncPay() {
    const p = document.getElementById("jrPay");
    if (p) p.disabled = !(J.book.consents.size === CONSENTS.length && J.book.name.trim().length > 1);
  }

  // Testing shortcut: rebuild the state as if every earlier step had been done.
  function jumpTo(target) {
    J = Object.assign(fresh(false), {notes: J.notes});
    const level = target === "care" ? 3 : Number(target);
    if (level >= 1) J.inq.status = "replied";
    if (level >= 2) { buildChecklist(); J.meet.status = "done"; J.meet.mg = "agreed"; }
    if (level >= 3) { J.book.status = "paid"; J.book.consents = new Set(CONSENTS.map((c) => c.k)); J.book.name = OWNER; }
    if (target === "care" || level >= 4) { J.trip.phase = "done"; J.unlocked = true; }
    J.stage = level;
    render();
    if (J.unlocked && A.onUnlock) A.onUnlock();
  }

  function init(adapter) {
    A = adapter;
    J = fresh(false);
    // Overlays live inside the phone so they never escape the frame.
    ["jrOverlay", "jrDanger"].forEach((id) => {
      if (document.getElementById(id)) return;
      const d = document.createElement("div");
      d.id = id; d.className = id === "jrOverlay" ? "jr-overlay" : "jr-danger"; d.hidden = true;
      if (id === "jrDanger") { d.setAttribute("role", "alertdialog"); d.setAttribute("aria-modal", "true"); }
      A.phone.appendChild(d);
    });
    document.getElementById("jrOverlay").addEventListener("click", (e) => { if (e.target.id === "jrOverlay") e.target.hidden = true; });
    // DANGER can't be dismissed by Escape or tapping outside (DESIGN.md §7.4).
    if (A.bellBefore && !document.getElementById("jrBell")) {
      const bell = document.createElement("button");
      bell.type = "button"; bell.id = "jrBell"; bell.className = "jr-bell"; bell.setAttribute("aria-label", "Updates");
      bell.innerHTML = `<span aria-hidden="true">🔔</span><span class="dot" id="jrBellDot" hidden></span>`;
      bell.onclick = openNotes;
      A.bellBefore.before(bell);
    }
    if (A.notesSheet && !document.getElementById("jrJump")) {
      const j = document.createElement("div");
      j.id = "jrJump"; j.className = "jr-jump jr";
      j.innerHTML = `<span class="jr-label">Testing: jump to a stage</span><div class="jr-chips">${["① Inquiry", "② Meet & Greet", "③ Booking", "④ Pick-up day", "④ Care in progress", "⑤ Home & review"]
        .map((t, i) => `<button type="button" class="chip" data-jump="${[0, 1, 2, 3, "care", 4][i]}">${t}</button>`).join("")}</div>`;
      j.addEventListener("click", (e) => {
        const c = e.target.closest("[data-jump]");
        if (!c) return;
        jumpTo(c.dataset.jump);
        if (A.closeNotes) A.closeNotes();
        A.goTab(c.dataset.jump === "care" ? "home" : "stay");
      });
      A.notesSheet.appendChild(j);
    }
    A.phone.addEventListener("click", onClick);
    A.stayMount.addEventListener("input", onInput);
    A.stayMount.addEventListener("change", onChange);
    render();
  }

  // Album categories (README ④ timeline album): Meals · Walks · Naps · Play.
  function cat(text) {
    const t = String(text).toLowerCase();
    if (/breakfast|dinner|lunch|meal|kibble|food|eat|bowl|treat/.test(t)) return "meals";
    if (/walk|potty|park|sniff|leash|zoom/.test(t)) return "walks";
    if (/nap|sleep|rest|snooze|blanket|bed|sunny spot|cozy/.test(t)) return "naps";
    return "play";
  }
  // Chip row that filters [data-cat] items inside `container`; inserted before `anchor`.
  function feedFilter(container, anchor) {
    if (!container || container.querySelector(".jr-filter")) return;
    const row = document.createElement("div");
    row.className = "jr-filter jr";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Filter photos");
    const opts = [["all", "All"], ["meals", "🍽️ Meals"], ["walks", "🦮 Walks"], ["naps", "😴 Naps"], ["play", "🎾 Play"]];
    row.innerHTML = opts.map(([v, l], i) => `<button type="button" class="chip${i === 0 ? " active" : ""}" data-filter="${v}" aria-pressed="${i === 0}">${l}</button>`).join("");
    row.addEventListener("click", (e) => {
      const b = e.target.closest("[data-filter]");
      if (!b) return;
      container.dataset.jrFilter = b.dataset.filter;
      row.querySelectorAll(".chip").forEach((c) => { const on = c === b; c.classList.toggle("active", on); c.setAttribute("aria-pressed", String(on)); });
    });
    anchor.before(row);
  }

  // Values collected during onboarding (owner name, first allergy, the sitter's rates).
  function configure(o) {
    if (o.owner) OWNER = o.owner;
    if ("allergy" in o) ALLERGY = o.allergy;
    if (o.rates) Object.assign(RATES, o.rates);
    if (J) render();
  }
  function jump(target) {
    if (target === "check") { jumpTo("care"); J.check.status = "open"; render(); A.goTab("stay"); return; }
    jumpTo(target); A.goTab(target === "care" ? "home" : "stay");
  }

  function reset() { clearInterval(tripTimer); clearTimeout(codeTimer); J = fresh(false); render(); }

  return {init, reset, render, cat, feedFilter, configure, jump, isUnlocked: () => !!(J && J.unlocked), stage: () => (J ? J.stage : 0)};
})();
