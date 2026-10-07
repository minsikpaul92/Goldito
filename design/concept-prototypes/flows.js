/* Flows to test, shared by index.html and compare.html.
   `hash` is the deep link each concept understands (see journey/onboard.js). */
window.PAWNOTE_FLOWS = [
  {id: "owner", name: "Owner onboarding", hash: "", what: "Welcome → role → account → pet → look → health & care → notifications. Try Back on every step and the simulated permission prompt."},
  {id: "sitter", name: "Sitter onboarding", hash: "sitter", what: "Rates change the sample quote live · house rules · availability calendar · the live profile and AI reply · “Try it as an owner”."},
  {id: "login", name: "Returning user", hash: "login", what: "Log in skips setup and lands on Home with “Plan a stay”."},
  {id: "splash", name: "Welcome splash", hash: "splash", what: "The animation that plays once after onboarding. Press Play splash to replay it."},
  {id: "stage-1", name: "Stage 1 · Inquiry", hash: "stage-1", what: "Pick a service, add Mochi, Ask Lucy → AI reply with the $268.13 CAD quote and sources."},
  {id: "stage-2", name: "Stage 2 · Meet & Greet", hash: "stage-2", what: "Care note → editable checklist and heads-up · propose a time · who drives each way."},
  {id: "stage-3", name: "Stage 3 · Booking", hash: "stage-3", what: "Consents + typed name gate Pay · address unlocks · entry code hides after 10 s."},
  {id: "stage-4", name: "Stage 4 · Pick-up", hash: "stage-4", what: "Live map and ETA · handoff photo check · care tabs unlock."},
  {id: "care", name: "Stage 4 · Care in progress", hash: "care", what: "Home, Feed filters (Meals · Walks · Naps · Play), Care check-off with Undo, Reports."},
  {id: "check", name: "Stage 4 · 5-second check", hash: "check", what: "As Lucy: pick ≤ 2 photos, turn off wrong AI chips, optional note → Generate → Send to Chloe."},
  {id: "treat", name: "Treat Guard", hash: "care", what: "Stay tab → “Lucy scans a new treat” → DANGER screen only closes with its button."},
  {id: "stage-5", name: "Stage 5 · Home & review", hash: "stage-5", what: "Drive home · return photo · stars · Life Record · Plan the next stay."},
];
window.PAWNOTE_CONCEPTS = [
  {k: "b", label: "Playful", file: "pawnote-concept-b-full-tamagotchi.html"},
  {k: "c", label: "Balanced", file: "pawnote-concept-c-balanced-skin.html"},
];
window.PAWNOTE_TRIED_KEY = "pawnote-concepts-tried";
