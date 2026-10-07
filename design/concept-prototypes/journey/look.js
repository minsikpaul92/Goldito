/* ==========================================================================
   Look step (owner onboarding): pick the app color. Shared by the journey
   prototypes; each concept mounts it with an adapter (its presets and theme math).
   Goldito green is the default; a color from the pet's coat is offered, never forced.
   ========================================================================== */
const Look = (() => {
  let A = null, host = null;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const forest = () => A.presets().findIndex((p) => p.name === "Forest");
  const label = (k) => (k === forest() ? "Goldito green" : A.presets()[k].name);

  function tag(k, name) {
    const f = forest(), d = A.detected();
    if (k === f && k === d) return `<span class="lk-tag">Default · suits ${name}</span>`;
    if (k === f) return `<span class="lk-tag">Default</span>`;
    if (k === d) return `<span class="lk-tag">From ${name}'s coat</span>`;
    return "";
  }
  function render() {
    if (!A || !host || A.get() == null) return;
    const P = A.presets(), i = A.get(), v = A.preview(i), name = esc(A.petName() || "your pet");
    host.innerHTML = `
      <div class="${A.headClass || ""}"><h2 class="${A.titleClass || ""}">Pick ${name}'s colors</h2>
        <p class="${A.subClass}">Start with Goldito green, or use a color from ${name}'s coat. You can change it anytime in Profile.</p></div>
      <div class="card lk-card">
        <div class="lk-preview" style="--lk:${v.primary};--lk-fg:${v.fg};--lk-soft:${v.soft};--lk-soft-text:${v.softText}">
          <div class="lk-photo"><img src="${A.photo()}" alt="${name}"></div>
          <div class="lk-mock" aria-hidden="true">
            <span class="lk-pill"><i></i>With Lucy now</span>
            <b>${name} is with Lucy</b>
            <span class="lk-bar"><i></i><i></i><i></i><i class="off"></i><i class="off"></i></span>
            <span class="lk-btn">See today's updates</span>
          </div>
        </div>
        <div class="lk-swatches" role="radiogroup" aria-label="App color">
          ${P.map((p, k) => `<button type="button" role="radio" class="lk-sw" data-i="${k}" aria-checked="${k === i}" tabindex="${k === i ? 0 : -1}">
            <span class="lk-dot" style="background:${A.swatch(k)};color:${A.preview(k, true).fg}">${k === i ? "✓" : ""}</span>
            <span class="lk-name">${label(k)}</span>${tag(k, name)}</button>`).join("")}
        </div>
        <p class="lk-note">✓ Text stays easy to read in every color.</p>
      </div>
      <div class="actions lk-actions">
        <button class="btn btn-primary" id="keepBtn" data-lk="keep" style="background:${v.primary};border-color:${v.primary};color:${v.fg}">Use ${label(i)}</button>
        ${i !== forest() ? `<button class="btn btn-secondary" data-lk="forest">Keep Goldito green</button>` : ""}
      </div>`;
  }
  function pick(k, focus) {
    A.set(k); render();
    if (focus) { const b = host.querySelector(`.lk-sw[data-i="${k}"]`); if (b) b.focus(); }
  }
  function mount(adapter) {
    A = adapter;
    host = document.querySelector('.screen[data-step="2"]');
    if (!host) return;
    host.classList.add("lk-screen");
    host.addEventListener("click", (e) => {
      const sw = e.target.closest(".lk-sw");
      if (sw) { pick(Number(sw.dataset.i)); return; }
      const b = e.target.closest("[data-lk]");
      if (!b) return;
      if (b.dataset.lk === "forest") A.set(forest());
      A.keep();
    });
    // Arrow keys move through the colors (radio group).
    host.addEventListener("keydown", (e) => {
      if (!e.target.closest(".lk-sw")) return;
      const n = A.presets().length, d = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[e.key];
      if (d) { e.preventDefault(); pick((A.get() + d + n) % n, true); }
    });
  }
  return {mount, render};
})();
