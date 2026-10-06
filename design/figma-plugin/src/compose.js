/* Redesign screens assembled from component INSTANCES (not captured layers), so editing a
   component on the Components page updates these screens. Each look is the same screen with
   the Color collection's mode set on the frame (Balanced; Playful lives in the prototypes only). */
let LIB = null;
const TODAY_GROUP = "Redesign · live app tabs (D47)";
// Sections on the Screens page, in reading order (laid out in a grid).
const UPCOMING_GROUPS = { booking: "Upcoming · Booking", care: "Upcoming · Pick-up & care", done: "Upcoming · Home & review" };
const ONBOARDING_GROUPS = { owner: "Onboarding (exploration) · Owner sign-up", sitter: "Onboarding (exploration) · Sitter setup", login: "Onboarding (exploration) · Log in" };
const EDGE_GROUPS = { before: "Edge states · Before the stay (①–③)", during: "Edge states · During the stay (④)", after: "Edge states · After the stay (⑤) and any screen" };
const SECTION_ORDER = () => [TODAY_GROUP, ...Object.values(UPCOMING_GROUPS), ...Object.values(EDGE_GROUPS), ...Object.values(ONBOARDING_GROUPS)];
const edgeGroup = (id) => /^e[123]-/.test(id) ? EDGE_GROUPS.before : /^e4-/.test(id) ? EDGE_GROUPS.during : EDGE_GROUPS.after;
const upGroup = (id) => /inquiry|care-request|meet|checkout|entry/.test(id) ? UPCOMING_GROUPS.booking : /review$|record/.test(id) && !/check-review/.test(id) ? UPCOMING_GROUPS.done : UPCOMING_GROUPS.care;
const obGroup = (id) => id.startsWith("sit-") ? ONBOARDING_GROUPS.sitter : id === "ob-login" ? ONBOARDING_GROUPS.login : ONBOARDING_GROUPS.owner;
async function loadLibrary(componentsPage) {
  await componentsPage.loadAsync();
  LIB = new Map();
  for (const n of componentsPage.children) if (n.type === "COMPONENT" || n.type === "COMPONENT_SET") LIB.set(n.name, n);
}
// inst("Button", { Style: "Primary", State: "Default" }, { Label: "Book care" })
function inst(name, variant = {}, text = {}) {
  const c = LIB.get(name);
  if (!c) throw new Error(`Missing component "${name}"`);
  let target = c;
  if (c.type === "COMPONENT_SET") {
    target = c.children.find((v) => Object.entries(variant).every(([k, val]) => v.name.split(", ").includes(`${k}=${val}`))) || c.defaultVariant || c.children[0];
  }
  const i = target.createInstance();
  const props = {};
  for (const [k, v] of Object.entries(text)) {
    if (v == null) continue; // Figma rejects empty property values
    const key = Object.keys(i.componentProperties).find((p) => p.split("#")[0] === k);
    if (key) props[key] = v;
  }
  if (Object.keys(props).length) i.setProperties(props);
  return i;
}
function stretch(n) { n.layoutSizingHorizontal = "FILL"; return n; }

async function screenFrame(title, tab, ava, buildBody, pinned) {
  const f = box(title, { w: 402, h: 874, fill: "background" });
  f.primaryAxisSizingMode = "FIXED";
  f.clipsContent = true;
  if (tab.full) { const m = inst(tab.full); add(f, m); stretch(m); m.layoutGrow = 1; return f; }
  add(f, inst("Top Bar", { Kind: tab.kind || "App" }, { Title: tab.title }));
  const body = box("Content", { gap: "md", pad: [4, "md", "md", "md"] });
  add(f, body); stretch(body); body.layoutGrow = 1;
  await buildBody(body);
  // Stretch cards and rows to the content width; small pieces (tags, chips, single buttons) keep their size.
  for (const c of body.children) { try { if (c.type !== "TEXT" && (c.width >= 300 || c.type === "FRAME")) stretch(c); } catch (e) {} }
  if (pinned) { const pin = box("Pinned", { pad: ["sm", "md", "sm", "md"] }, [pinned]); add(f, pin); stretch(pin); stretch(pinned); }
  if (tab.active) add(f, inst("Tab Bar", { Active: tab.active }));
  if (ava) { const a = f.findOne((n) => n.type === "TEXT" && n.name === "Initial"); if (a) { await figma.loadFontAsync(a.fontName); a.characters = ava; } }
  return f;
}
const row = (name, kids, gap = "sm") => box(name, { dir: "H", gap, wrap: true }, kids);
// Equal-width options that share one line (segments, two buttons).
const split = (name, kids, gap = "xs") => { const r = box(name, { dir: "H", gap }, kids); for (const k of kids) { k.layoutGrow = 1; } return r; };

const UPCOMING = [
  ["up-inquiry", "Inquiry · AI reply (07B)", { kind: "Detail", title: "Ask Lucy", active: "Bookings" }, null, async (b) => {
    add(b, inst("Message Bubble", { From: "Owner" }, { Message: "Is Lucy free Oct 9–12 for Max and Mochi? Can Max take her pill in a treat?" }));
    add(b, inst("Message Bubble", { From: "Sitter" }, { Message: "Hi Chloe! Lucy is free Oct 9–12 for Max and Mochi. Max can take her pill in a treat. Total with the Thanksgiving rate is below." }));
    add(b, inst("Quote Card"));
  }, () => inst("Button", { Style: "Primary", State: "Default" }, { Label: "Request booking" })],
  ["up-care-request", "Care request → checklist (06)", { kind: "Detail", title: "Care request", active: "Bookings" }, null, async (b) => {
    add(b, inst("Card", {}, { Title: "Your request for Max", Body: "Breakfast 8 AM, 1 cup kibble. Skin pill at 2 PM in a treat. Two walks — she pulls on the leash." }));
    add(b, await txt("✦ Checklist from your request · edit anything", "Small Strong"));
    add(b, inst("Checklist Row", {}, { Time: "8 AM", Task: "1 cup of kibble" }));
    add(b, inst("Checklist Row", {}, { Time: "2 PM", Task: "Skin pill · 1 tablet in a treat" }));
    add(b, inst("Checklist Row", {}, { Time: "9 AM", Task: "Walk 20 min" }));
    add(b, inst("Checklist Row", {}, { Time: "6 PM", Task: "Walk 20 min" }));
    add(b, inst("Tag", { Tone: "Warning" }, { Label: "⚠️ Heads-up · pulls on the leash" }));
  }, () => inst("Button", { Style: "Primary", State: "Default" }, { Label: "Save checklist" })],
  ["up-meet-greet", "Meet & Greet (3B.9)", { kind: "Detail", title: "Booking", active: "Bookings" }, null, async (b) => {
    add(b, inst("Booking Card", { Status: "Requested" }));
    add(b, await txt("First stay with Lucy — meet before the booking?", "Body Strong", "text", { fill: true }));
    add(b, split("Mode", [inst("Segment", { State: "Selected" }, { Label: "🤝 In person" }), inst("Segment", { State: "Default" }, { Label: "📹 Video" })]));
    add(b, inst("Card", {}, { Title: "Sat Oct 3 · 11:00 AM · 20 min", Body: "Trinity Bellwoods dog park (your saved spot)" }));
    add(b, await txt("Go over together", "Small Strong"));
    add(b, row("Agenda", ["Care needs", "Quirks", "Route", "Handoff", "Heads-up"].map((l) => inst("Filter Chip", { State: "Default" }, { Label: l })), "xs"));
    add(b, inst("Text Button", { Tone: "Default", State: "Enabled" }, { Label: "Skip Meet & Greet" }));
  }, () => inst("Button", { Style: "Primary", State: "Default" }, { Label: "Propose this time" })],
  ["up-checkout", "Checkout · consents (03C)", { kind: "Detail", title: "Checkout", active: "Bookings" }, null, async (b) => {
    add(b, inst("Quote Card"));
    add(b, await txt("Consents (3/5)", "Small Strong"));
    add(b, inst("Consent Card", { Checked: "Yes" }));
    add(b, inst("Consent Card", { Checked: "Yes" }, { Title: "Lockbox and buzzer use", Summary: "Lucy may use your lockbox code only during the booked visits." }));
    add(b, inst("Consent Card", { Checked: "No" }, { Title: "Handoff rules", Summary: "Drop-off and pick-up happen at the agreed time and place." }));
    add(b, inst("Text Field", { State: "Default" }, { Label: "Type your full name to sign", Value: "e.g. Chloe Park", Helper: "Signs all 5 consents." }));
  }, () => inst("Button", { Style: "Primary", State: "Disabled" }, { Label: "Pay $268.13 (demo)" })],
  ["up-entry", "Paid · entry info (03C)", { kind: "Detail", title: "Booking", active: "Bookings" }, null, async (b) => {
    add(b, inst("Booking Card", { Status: "Confirmed" }));
    add(b, inst("Entry Info Card", { State: "Locked" }));
    add(b, inst("Entry Info Card", { State: "Code shown" }));
  }, () => inst("Button", { Style: "Primary", State: "Default" }, { Label: "Go to pick-up day" })],
  ["up-trip", "Live trip (06B)", { kind: "Detail", title: "Pick-up", active: "Bookings" }, null, async (b) => {
    add(b, inst("Trip Map"));
    add(b, inst("Tag", { Tone: "Warning" }, { Label: "⚠️ Max · crate in the back seat" }));
  }, () => inst("Button", { Style: "Secondary", State: "Default" }, { Label: "Simulate the drive" })],
  ["up-handoff", "Handoff photo check (06B)", { kind: "Detail", title: "Pick-up", active: "Bookings" }, null, async (b) => {
    add(b, inst("Trip Map", {}, { ETA: "Arrived" }));
    add(b, inst("Photo Check"));
    add(b, inst("Toast", {}, { Message: "Care has started · photo verified" }));
  }, null],
  ["up-check", "5-second check (7.7)", { kind: "Detail", title: "5-second check", active: "Diary" }, "L", async (b) => {
    add(b, await txt("Photos (2/2)", "Small Strong"));
    add(b, row("Photos", [inst("Photo Tile", { State: "Selected" }), inst("Photo Tile", { State: "Selected" }), inst("Photo Tile", { State: "Default" }), inst("Photo Tile", { State: "Default" })], "xs"));
    add(b, await txt("✦ Suggested from today · tap to turn off", "Small Strong"));
    add(b, row("Chips", [["🍽️ Breakfast", "On"], ["💊 Pill in a treat", "On"], ["🦮 Walk 20 min", "On"], ["💩 Potty normal", "On"], ["🐿️ Squirrel", "Off"], ["😴 Long nap", "On"]].map(([l, st]) => inst("Suggestion Chip", { State: st }, { Label: l })), "xs"));
    add(b, inst("Text Field", { State: "Default" }, { Label: "Short note (optional)", Value: "e.g. Loved the squirrels today", Helper: "0/200" }));
  }, () => inst("Button", { Style: "Primary", State: "Default" }, { Label: "Generate daily note" })],
  ["up-check-review", "Daily note · review (7.3)", { kind: "Detail", title: "5-second check", active: "Diary" }, "L", async (b) => {
    add(b, inst("Daily Note"));
    add(b, row("Photos", [inst("Photo Tile", { State: "Default" }), inst("Photo Tile", { State: "Default" })], "xs"));
    add(b, inst("Text Button", { Tone: "Default", State: "Enabled" }, { Label: "Change chips or note" }));
  }, () => inst("Button", { Style: "Primary", State: "Default" }, { Label: "Send to Chloe" })],
  ["up-danger", "Treat Guard · DANGER (08)", { full: "Alert Modal · DANGER" }, null, async () => {}, null],
  ["up-review", "Home safe · review (07C)", { kind: "Detail", title: "Home safe", active: "Bookings" }, null, async (b) => {
    add(b, inst("Photo Check"));
    add(b, await txt("How was Lucy?", "Body Strong"));
    add(b, row("Stars", [1, 2, 3, 4, 5].map(() => inst("Star", { State: "On" })), 0));
    add(b, row("Thanks", ["Thank you, Lucy!", "Max loved it", "Great photos"].map((l, i) => inst("Filter Chip", { State: i ? "Default" : "Active" }, { Label: l })), "xs"));
  }, () => inst("Button", { Style: "Primary", State: "Default" }, { Label: "Send review" })],
  ["up-record", "Life Record (07C)", { kind: "Detail", title: "Life Record", active: "Bookings" }, null, async (b) => {
    add(b, inst("Life Record Card"));
    add(b, await txt("The next sitter's checklist and AI replies start from this.", "Small", "text-muted", { fill: true }));
  }, () => inst("Button", { Style: "Primary", State: "Default" }, { Label: "Plan the next stay" })],
];

const P = (l) => () => inst("Button", { Style: "Primary", State: "Default" }, { Label: l });
const chips = (name, list, active = []) => row(name, list.map((l) => inst("Filter Chip", { State: active.includes(l) ? "Active" : "Default" }, { Label: l })), "xs");
// Placeholder and helper per field (the component's defaults are for "Pet's name").
const FIELD = { "Full name": ["e.g. Chloe Park", "Shown to your sitter."], Email: ["e.g. chloe@example.com", "We'll send booking updates here."], Password: ["At least 8 characters", "Use 8 or more characters."], "Pet's name": ["e.g. Max", "Shown on every booking."], Breed: ["e.g. Maltese", "Helps the sitter with care tips."] };
const field = (label) => inst("Text Field", { State: "Default" }, { Label: label, Value: (FIELD[label] || [])[0], Helper: (FIELD[label] || [])[1] });
const ONBOARDING = [
  ["ob-welcome", "Welcome", { title: "PawNote" }, null, async (b) => {
    add(b, row("Photos", [inst("Avatar", { Kind: "Photo" }), inst("Avatar", { Kind: "Photo" }), inst("Avatar", { Kind: "Photo" })], "xs"));
    add(b, await txt("Pet care updates that come to you", "Title", "text", { fill: true }));
    add(b, await txt("Book a sitter you trust, then follow along with photos, care check-offs and a daily report.", "Body", "text-muted", { fill: true }));
    add(b, inst("Feature Row"));
    add(b, inst("Feature Row", {}, { Emoji: "✅", Title: "Every meal, walk and pill", Line: "Checked off by the sitter as it happens." }));
    add(b, inst("Feature Row", {}, { Emoji: "🚗", Title: "Live pick-up and drop-off", Line: "See the trip and the arrival photo." }));
    add(b, inst("Button", { Style: "Secondary", State: "Default" }, { Label: "I already have an account" }));
  }, P("Get started")],
  ["ob-role", "Role", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("How will you use PawNote?", "Title", "text", { fill: true }));
    add(b, inst("Choice Card", { Size: "Large", Selected: "Yes" }));
    add(b, inst("Choice Card", { Size: "Large", Selected: "No" }, { Title: "I'm a pet sitter", Subtitle: "Get booked, then care, snap and tap" }));
  }, P("Continue")],
  ["ob-account", "Create account", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("Create your account", "Title"));
    add(b, inst("Button", { Style: "Secondary", State: "Default" }, { Label: "Continue with Apple" }));
    add(b, inst("Button", { Style: "Secondary", State: "Default" }, { Label: "Continue with Google" }));
    add(b, field("Full name")); add(b, field("Email")); add(b, field("Password"));
  }, P("Create account")],
  ["ob-pet", "Add your pet", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("Add your pet", "Title"));
    add(b, field("Pet's name"));
    add(b, split("Species", [inst("Segment", { State: "Selected" }, { Label: "🐶 Dog" }), inst("Segment", { State: "Default" }, { Label: "🐱 Cat" })]));
    add(b, row("Photos", [inst("Photo Tile", { State: "Selected" }), inst("Photo Tile", { State: "Default" }), inst("Photo Tile", { State: "Default" }), inst("Photo Tile", { State: "Upload" })], "xs"));
  }, P("Continue")],
  ["ob-look", "Your look", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("Your app now matches Max 🐶", "Title", "text", { fill: true }));
    add(b, inst("Theme Preview"));
    add(b, inst("Button", { Style: "Secondary", State: "Default" }, { Label: "Try another preset" }));
  }, P("Keep this look")],
  ["ob-health", "Health & care", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("What should Lucy know about Max?", "Title", "text", { fill: true }));
    add(b, field("Breed"));
    add(b, chips("Age", ["Puppy", "Adult", "Senior"], ["Adult"]));
    add(b, chips("Allergies", ["Chicken", "Beef", "Grain", "None"], ["Chicken"]));
    add(b, chips("Personality", ["Friendly with dogs", "Pulls on leash", "Shy"], ["Pulls on leash"]));
    add(b, inst("Tag", { Tone: "Warning" }, { Label: "⚠️ Allergic to chicken" }));
  }, P("Save and continue")],
  ["ob-updates", "Notifications", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("Know how it's going without asking", "Title", "text", { fill: true }));
    add(b, inst("Push Preview"));
    add(b, inst("Switch Row", {}, { Title: "Photos and captions", Subtitle: "As they're posted" }));
    add(b, inst("Switch Row", {}, { Title: "Care check-offs", Subtitle: "Meals, walks, medication" }));
    add(b, inst("Switch Row"));
    add(b, inst("Switch Row", {}, { Title: "Safety alerts", Subtitle: "Always on" }));
  }, P("Turn on notifications")],
  ["ob-permission", "Permission prompt", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("Know how it's going without asking", "Title", "text", { fill: true }));
    add(b, inst("Push Preview"));
    const c = box("Prompt", { dir: "H", justify: "CENTER" }, [inst("Permission Prompt")]); add(b, c);
  }, null],
  ["sit-services", "Services & rates", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("What do you offer, and for how much?", "Title", "text", { fill: true }));
    add(b, inst("Switch Row", {}, { Title: "Boarding", Subtitle: "Pets stay at your home" }));
    add(b, inst("Stepper", {}, { Value: "$55", Unit: "/ night" }));
    add(b, inst("Switch Row", {}, { Title: "House sitting", Subtitle: "You stay at the owner's home" }));
    add(b, chips("Extra pet", ["+25%", "+50%", "+75%"], ["+50%"]));
    add(b, inst("Card", {}, { Title: "$268.13 CAD", Body: "2 pets · Oct 9–12 · Thanksgiving included" }));
  }, P("Continue")],
  ["sit-house", "House rules", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("House rules owners should know", "Title", "text", { fill: true }));
    add(b, chips("Home", ["House", "Condo", "Apartment"], ["Condo"]));
    add(b, chips("Rules", ["Fenced yard", "Smoke-free", "Crate available"], ["Smoke-free", "Crate available"]));
    add(b, inst("Stepper", {}, { Value: "2", Unit: "max pets" }));
    add(b, inst("Choice Card", { Size: "Compact", Selected: "Yes" }));
    add(b, inst("Choice Card", { Size: "Compact", Selected: "No" }, { Title: "Strict", Subtitle: "50% refund up to 7 days before" }));
  }, P("Continue")],
  ["sit-availability", "Availability", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("When can you take bookings?", "Title", "text", { fill: true }));
    add(b, await txt("October 2026", "Body Strong"));
    for (const week of [[4, 5, 6, 7, 8, 9, 10], [11, 12, 13, 14, 15, 16, 17]])
      add(b, row("Week", week.map((d) => inst("Calendar Day", { State: d === 12 ? "Holiday" : [9, 10, 11, 16, 17].includes(d) ? "Open" : "Closed" }, { Day: String(d) })), 4));
  }, P("Publish my profile")],
  ["sit-live", "Live profile", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("You're ready to be booked, Lucy", "Title", "text", { fill: true }));
    add(b, inst("Profile Card"));
    add(b, inst("Message Bubble", { From: "Owner" }, { Message: "Are you free Oct 9–12 for Max and Mochi?" }));
    add(b, inst("Message Bubble", { From: "Sitter" }, { Message: "Hi Chloe! Lucy is free Oct 9–12 for Max and Mochi. Max can take her pill in a treat. Total with the Thanksgiving rate is below." }));
  }, P("Try it as an owner")],
  ["ob-login", "Log in", { kind: "Onboarding" }, null, async (b) => {
    add(b, await txt("Welcome back", "Title"));
    add(b, field("Email")); add(b, field("Password"));
    add(b, inst("Text Button", { Tone: "Default", State: "Enabled" }, { Label: "Forgot password?" }));
  }, P("Log in")],
];

// Edge states (DESIGN.md §10): what owners and sitters see when things don't go to plan.
// e1-…e3- = stages ①–③, e4- = stage ④, e5-/ex- = stage ⑤ and any screen.
const banner = (tone, title, body, action) => inst("Banner", { Tone: tone }, { Title: title, Body: body, Action: action });
const EDGE = [
  ["e1-unavailable", "① Dates are full", { kind: "Detail", title: "Ask Lucy", active: "Bookings" }, null, async (b) => {
    add(b, inst("Message Bubble", { From: "Owner" }, { Message: "Is Lucy free Oct 9–12 for Max and Mochi?" }));
    add(b, inst("Message Bubble", { From: "Sitter" }, { Message: "Hi Chloe! Lucy is full Oct 9–12. She's open Oct 13–16 or Oct 20–23 — want one of those?" }));
    add(b, chips("Other dates", ["Oct 13–16", "Oct 20–23"], ["Oct 13–16"]));
    add(b, await txt("Dates and prices come from Lucy's calendar, never from the assistant.", "Small", "text-muted", { fill: true }));
  }, P("Ask about Oct 13–16")],
  ["e1-human", "① The assistant hands over", { kind: "Detail", title: "Ask Lucy", active: "Bookings" }, null, async (b) => {
    add(b, inst("Message Bubble", { From: "Owner" }, { Message: "Max had a seizure in August. Is Lucy OK giving her meds if it happens again?" }));
    add(b, banner("Info", "Lucy will answer this one herself", "Health questions always go to Lucy, not the assistant. Usually within 2 hours — you'll get a notification.", "Got it"));
  }, null],
  ["e2-dose", "② Checklist needs a fix", { kind: "Detail", title: "Care request", active: "Bookings" }, null, async (b) => {
    add(b, inst("Checklist Row", {}, { Time: "8 AM", Task: "1 cup of kibble" }));
    add(b, inst("Checklist Row", {}, { Time: "2 PM", Task: "Skin pill · dose?" }));
    add(b, inst("Tag", { Tone: "Warning" }, { Label: "⚠️ Add the dose — the assistant never guesses doses" }));
    add(b, inst("Checklist Row", {}, { Time: "4 PM", Task: "Chicken jerky as a reward" }));
    add(b, inst("Tag", { Tone: "Danger" }, { Label: "chicken — Max is allergic" }));
    add(b, await txt("Fix 2 items to save.", "Small", "text-muted"));
  }, () => inst("Button", { Style: "Primary", State: "Disabled" }, { Label: "Save checklist" })],
  ["e3-declined", "③ Sitter can't take it", { kind: "Detail", title: "Booking", active: "Bookings" }, null, async (b) => {
    add(b, banner("Info", "Lucy can't take Oct 9–12", "You weren't charged. Paul is open those dates and takes dogs and cats.", "See Lucy's open dates"));
    add(b, inst("Profile Card", {}, { Name: "Paul Lee", Meta: "Sitter · House · up to 3 pets" }));
  }, P("Ask Paul")],
  ["e3-payment", "③ Payment failed", { kind: "Detail", title: "Checkout", active: "Bookings" }, null, async (b) => {
    add(b, banner("Error", "Payment didn't go through", "You weren't charged. Your 5 consents and signature are kept — just try again.", "Use another card"));
    add(b, inst("Quote Card"));
  }, () => inst("Button", { Style: "Primary", State: "Default" }, { Label: "Try again · $268.13" })],
  ["e3-entry-missing", "③ Entry info not added (sitter)", { kind: "Detail", title: "Booking", active: "Bookings" }, "L", async (b) => {
    add(b, inst("Booking Card", { Status: "Confirmed" }));
    add(b, banner("Warning", "Chloe hasn't added entry info yet", "We reminded her. It unlocks for you 2 hours before pick-up once it's added.", "Message Chloe"));
    add(b, inst("Entry Info Card", { State: "Locked" }));
  }, null],
  ["e4-late", "④ Sitter running late (owner)", { kind: "Detail", title: "Pick-up", active: "Bookings" }, null, async (b) => {
    add(b, banner("Warning", "Lucy is running 10 min late", "New ETA 7:40 AM — updated on its own. Nothing to do.", "Message Lucy"));
    add(b, inst("Trip Map", {}, { ETA: "16 min" }));
  }, null],
  ["e4-location-off", "④ Location is off (sitter)", { kind: "Detail", title: "Pick-up", active: "Bookings" }, "L", async (b) => {
    add(b, banner("Offline", "Location is off", "Chloe sees these updates instead of the map. Turn location on in Settings any time.", "Open Settings"));
    add(b, split("Status", [inst("Button", { Style: "Secondary", State: "Default" }, { Label: "Leaving now" }), inst("Button", { Style: "Secondary", State: "Default" }, { Label: "10 min away" })], "sm"));
  }, P("I'm here")],
  ["e4-retake", "④ Photo check unsure (sitter)", { kind: "Detail", title: "Pick-up", active: "Bookings" }, "L", async (b) => {
    add(b, inst("Photo Check", { Result: "Retake" }));
    add(b, await txt("Retake with the crate in view, or confirm it yourself. Chloe will see \"Checked by Lucy\" instead of \"Photo verified\".", "Small", "text-muted", { fill: true }));
    add(b, inst("Text Button", { Tone: "Default", State: "Enabled" }, { Label: "Confirm by eye" }));
  }, P("Retake photo")],
  ["e4-offline", "④ Offline check-ins (sitter)", { title: "Home", active: "Home" }, "L", async (b) => {
    add(b, banner("Offline", "You're offline", "2 check-ins are saved on this phone and send on their own when you're back.", "Retry now"));
    add(b, inst("Task Row", { State: "Done" }, { Title: "Breakfast · 1 cup", Time: "8:00 AM" }));
    add(b, inst("Tag", { Tone: "Neutral" }, { Label: "⏳ Waiting to send" }));
    add(b, inst("Task Row", { State: "Next" }, { Title: "Skin pill in a treat", Time: "2:00 PM" }));
  }, null],
  ["e4-overdue", "④ Medication is late (sitter)", { title: "Home", active: "Home" }, "L", async (b) => {
    add(b, banner("Warning", "Max's pill is 40 min late", "Give it now and tap Complete. Chloe sees the real time it was given.", "Call Chloe"));
    add(b, inst("Task Row", { State: "Next" }, { Title: "Skin pill in a treat", Time: "2:00 PM · 40 min late" }));
  }, null],
  ["e4-empty", "④ No photos yet today (owner)", { title: "Feed", active: "Feed" }, null, async (b) => {
    add(b, row("Pets", [inst("Filter Chip", { State: "Active" }, { Label: "🐶 Max" }), inst("Filter Chip", { State: "Active" }, { Label: "🐱 Mochi" })], "xs"));
    add(b, inst("Empty State", {}, { Title: "No photos yet today", Message: "Lucy usually posts after the morning walk (about 9 AM). You'll get a notification.", Action: "See today's plan" }));
  }, null],
  ["e4-unreadable", "④ Treat label unreadable (sitter)", { kind: "Detail", title: "Treat Guard", active: "Home" }, "L", async (b) => {
    add(b, row("Photo", [inst("Photo Tile", { State: "Default" })], "xs"));
    add(b, banner("Warning", "Couldn't read this label", "Don't feed it yet. We asked Chloe — her answer shows here. Unsure always means no.", "Ask Chloe again"));
  }, P("Retake photo")],
  ["e5-low-review", "⑤ Low rating", { kind: "Detail", title: "Home safe", active: "Bookings" }, null, async (b) => {
    add(b, await txt("How was Lucy?", "Body Strong"));
    add(b, row("Stars", [1, 2, 3, 4, 5].map((n) => inst("Star", { State: n <= 2 ? "On" : "Off" })), 0));
    add(b, inst("Text Field", { State: "Default" }, { Label: "What could have gone better? (optional)", Value: "e.g. More photos in the afternoon", Helper: "Only Lucy sees this." }));
  }, P("Send review")],
  ["e5-new-fact", "⑤ New fact needs your OK", { kind: "Detail", title: "Life Record", active: "Bookings" }, null, async (b) => {
    add(b, inst("Life Record Card"));
    add(b, banner("Info", "New from this stay: scared of the vacuum", "From Lucy · Oct 11. It goes into Max's profile only if you say so.", "Not accurate"));
  }, P("Add to Max's profile")],
  ["ex-loading", "Any · Loading", { title: "Home", active: "Home" }, null, async (b) => {
    add(b, inst("Skeleton", { Kind: "Block" }));
    add(b, inst("Skeleton", { Kind: "Card" }));
    add(b, inst("Skeleton", { Kind: "Card" }));
    add(b, inst("Skeleton", { Kind: "Line" }));
  }, null],
];

const COMPOSED = [
  ["owner-home", "Owner · Home", { title: "Home", active: "Home" }, null, async (b) => {
    add(b, inst("Stay Summary Card"));
    add(b, inst("Latest Update Row"));
    add(b, box("Your pets", { dir: "H", justify: "SPACE_BETWEEN" }, [await txt("Your pets", "Body Strong"), await txt("+ Add pet", "Small Strong", "primary")]));
    add(b, split("Pets", [inst("Pet Mini Card", {}, { Name: "Max", Meta: "Maltese · 4 yrs" }), inst("Pet Mini Card", {}, { Name: "Mochi", Meta: "Shorthair · 3 yrs" })], "sm"));
    add(b, inst("Tag", { Tone: "Warning" }, { Label: "⚠️ Max · allergic to chicken" }));
  }, () => inst("Button", { Style: "Primary", State: "Default" }, { Label: "See today's updates" })],
  ["owner-bookings", "Owner · Bookings", { title: "Bookings", active: "Bookings" }, null, async (b) => {
    add(b, split("Tabs", [inst("Segment", { State: "Selected" }, { Label: "Upcoming" }), inst("Segment", { State: "Default" }, { Label: "Requests" }), inst("Segment", { State: "Default" }, { Label: "Past" })]));
    add(b, inst("Booking Card", { Status: "In care" }));
    add(b, inst("Day Header", {}, { Day: "Your sitters", Count: "See all" }));
    add(b, inst("Profile Card"));
  }, () => inst("Button", { Style: "Primary", State: "Default" }, { Label: "Book care" })],
  ["owner-feed", "Owner · Feed", { title: "Feed", active: "Feed" }, null, async (b) => {
    add(b, row("Pets", [inst("Filter Chip", { State: "Active" }, { Label: "🐶 Max" }), inst("Filter Chip", { State: "Active" }, { Label: "🐱 Mochi" })], "xs"));
    add(b, row("Categories", ["All", "🍽️ Meals", "🦮 Walks", "😴 Naps", "🎾 Play"].map((l, i) => inst("Filter Chip", { State: i ? "Default" : "Active" }, { Label: l })), "xs"));
    add(b, inst("Day Header", {}, { Day: "Today · Sat Oct 10", Count: "6 photos" }));
    add(b, row("Grid", ["Meals", "Walks", "Naps"].map((k) => inst("Grid Photo", { Category: k })), 4));
    add(b, inst("Feed Card"));
  }, null],
  ["owner-diary", "Owner · Diary", { title: "Diary", active: "Diary" }, null, async (b) => {
    add(b, inst("Daily Note"));
    add(b, inst("Day Header", {}, { Day: "Today", Count: "3 updates" }));
    add(b, inst("Timeline Row", { Kind: "Photo" }, { Time: "9:02", Text: "Walk · 20 min, all good" }));
    add(b, inst("Timeline Row", { Kind: "Text" }, { Time: "8:12", Text: "Breakfast · finished the bowl ✓" }));
    add(b, inst("Timeline Row", { Kind: "Text" }, { Time: "7:30", Text: "Picked up · photo verified ✓" }));
  }, null],
  ["owner-mood", "Owner · Mood", { title: "Mood", active: "Mood" }, null, async (b) => {
    add(b, row("Pets", [inst("Filter Chip", { State: "Active" }, { Label: "🐶 Max" }), inst("Filter Chip", { State: "Default" }, { Label: "🐱 Mochi" })], "xs"));
    add(b, inst("Mood Result Card"));
  }, () => inst("Button", { Style: "Secondary", State: "Default" }, { Label: "📷 Check a photo or clip" })],
  ["sitter-home", "Sitter · Home", { title: "Home", active: "Home" }, "L", async (b) => {
    add(b, inst("Next Task Card"));
    add(b, inst("Tag", { Tone: "Warning" }, { Label: "⚠️ No knocking · text Chloe instead" }));
    add(b, await txt("Quick check-in · Max", "Small Strong"));
    add(b, row("Check-in", ["🍽️ Ate", "💩 Potty", "🦮 Walk", "😊 Mood"].map((l) => inst("Filter Chip", { State: "Default" }, { Label: l })), "xs"));
    add(b, inst("Progress Bar", {}, { Label: "2 of 5 tasks · 6 check-ins" }));
    add(b, split("Actions", [inst("Button", { Style: "Secondary", State: "Default" }, { Label: "🔍 Scan a treat" }), inst("Button", { Style: "Secondary", State: "Default" }, { Label: "📝 5-second check" })], "sm"));
  }, null],
];

// Returns [{id, title, look, frame}] built off-canvas; the caller places them.
async function buildComposedScreens(log) {
  const color = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === "Color");
  // Default mode ≈ Balanced, so only the named looks are built (Default only when there are no looks).
  const looks = color && color.modes.length > 1 ? color.modes.slice(1).map((m) => [m.name, m.modeId]) : [["Default", null]];
  const out = [];
  const all = [...COMPOSED.map((x) => [TODAY_GROUP, ...x]), ...UPCOMING.map((x) => [upGroup(x[0]), ...x]), ...EDGE.map((x) => [edgeGroup(x[0]), ...x]), ...ONBOARDING.map((x) => [obGroup(x[0]), ...x])];
  for (const [group, id, title, tab, ava, body, pinned] of all) {
    for (const [look, modeId] of looks) {
      try {
        const f = await screenFrame(`${title} · ${look}`, tab, ava, body, pinned ? pinned() : null);
        if (modeId) f.setExplicitVariableModeForCollection(color, modeId);
        out.push({ group, id, title, look, frame: f });
      } catch (e) { log.push(`Composed ${id} (${look}): ${e.message || e}`); }
    }
  }
  return out;
}
