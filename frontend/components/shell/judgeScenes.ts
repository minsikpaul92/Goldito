import type { DemoState } from "../../lib/demoReset";
import type { Role } from "../../providers/SessionProvider";
import type { ScriptStep } from "./judgeScript";

/**
 * The judge panel's scenes (#413), in story order. Each one resets the judge's set to `state` (null: keeps the stay),
 * opens `owner` and `sitter` on their phones (one phone shows the `lead` side), then plays its script there (taps and
 * typing, judgeScript) or outlines the control to tap.
 * Paths may hold `{booking}` (the set's latest booking) or be `{chat}` (the owner's chat with the set's sitter).
 * Tags name what really runs: Nemotron models (NVIDIA) apart from Qwen3, Groq Whisper and Tavily.
 */

/**
 * `script`: what the phone then taps and types by itself (judgeScript); without one, `highlight` outlines what to tap.
 * `after`: this side's script waits until the other side's is done. `finale`: steps once every script is done (the
 * invite to try it by hand).
 */
export type SceneTarget = { path: string; highlight?: string; script?: ScriptStep[]; after?: boolean; finale?: ScriptStep[] };

export type Play = { label: string; role: Role; what: "reply" | "drive" };

export type SceneTag = { label: string; nvidia?: boolean };

export type Scene = {
  key: string;
  title: string;
  /** One short line: what to tap. */
  hint: string;
  state: DemoState | null;
  lead: Role;
  owner: SceneTarget;
  sitter: SceneTarget;
  tags: SceneTag[];
  /** The part a judge cannot do alone: the other side's reply, or the drive. */
  play?: Play;
  /** Run `play` by itself once the scripts are done (or right away when there are none). */
  autoPlay?: boolean;
  /** Folded under More. */
  more?: boolean;
  /** Why the scene matters, in a popup with Play before it starts. */
  intro?: { title: string; body: string; note?: string };
  /** Above 1 plays the scripts slower (2: half speed). */
  pace?: number;
};

export const NANO: SceneTag = { label: "Nemotron Nano", nvidia: true };
export const SUPER: SceneTag = { label: "Nemotron Super", nvidia: true };
export const ULTRA: SceneTag = { label: "Nemotron Ultra", nvidia: true };
export const VISION: SceneTag = { label: "Nemotron Super VL", nvidia: true };
export const TAVILY: SceneTag = { label: "Tavily" };

const SITTER_HOME: SceneTarget = { path: "/sitter" };
const OWNER_HOME: SceneTarget = { path: "/owner" };

const AI_MS = 90_000;

/**
 * Add pet: a sample photo instead of the file dialog, "Or type it" instead of the microphone, then every question
 * answered (chicken as the food to avoid, like the Max of the story).
 */
const MEET_SCRIPT: ScriptStep[] = [
  { tap: "own-species-dog" },
  { wait: "own-step-name" },
  // The sample photo is Max, so the new pet is called Max too.
  { type: "own-name", text: "Max" },
  { tap: "own-next" },
  { wait: "own-step-photos" },
  { tap: "own-photo-add" },
  { tap: "sample-mood_tug" },
  { tap: "crop-confirm" },
  { wait: "own-photo-0", timeout: 60_000 },
  { tap: "own-next" },
  { wait: "own-step-voice" },
  { tap: "own-voice-type" },
  { type: "own-voice-personality", text: "Gentle and curious" },
  { type: "own-voice-loves", text: "Squeaky toys and belly rubs" },
  { type: "own-voice-scares", text: "Thunder. A blanket over his crate calms him." },
  { type: "own-voice-routine", text: "Breakfast at 7, a walk at noon, dinner at 6, bed at 10" },
  { type: "own-voice-health", text: "Healthy, no daily meds" },
  { type: "own-voice-careful", text: "He slips his collar if he sees a squirrel" },
  { type: "own-voice-more", text: "He sleeps better with his blue toy" },
  { tap: "own-voice-use" },
  // Breed, age, weight and foods are asked on their own screens: the breed comes from the list.
  { wait: "own-step-breed" },
  // Typing searches the list; then Maltese is picked from it.
  { type: "own-breed", text: "Malt" },
  { tap: "own-breed-option-maltese" },
  { tap: "own-next" },
  { wait: "own-step-coat" },
  { tap: "own-coat-white" },
  { wait: "own-step-age" },
  { tap: "own-next" },
  { wait: "own-step-weight" },
  { type: "own-weight", text: "4" },
  { tap: "own-generate" },
  { wait: "own-step-reveal" },
  { pause: 3_000 },
  { tap: "own-next", timeout: AI_MS },
  { wait: "own-step-petIntro" },
  { tap: "own-next" },
  { wait: "own-step-about" },
  { tap: "own-next" },
  // "Where these questions come from": every personality question gets an answer (each moves on by itself).
  ...[3, 4, 2, 3, 4, 3, 2, 4, 3, 3, 4, 2].map((n): ScriptStep => ({ tap: `own-opt-${n}` })),
  { wait: "own-step-s:s1" },
  { tap: "own-safe-never" },
  { wait: "own-step-s:s2" },
  { tap: "own-safe-all" },
  { wait: "own-step-s:s3" },
  { tap: "own-safe-never" },
  { wait: "own-step-s:s4" },
  { tap: "own-safe-never" },
  { wait: "own-step-s:s5" },
  { tap: "own-safe-*" },
  { wait: "own-step-foods" },
  { tap: "own-food-chicken" },
  { tap: "own-next" },
  { tap: "own-foods-confirm" },
  { wait: "own-glance-needs", timeout: AI_MS },
  { pause: 3_000 },
  { tap: "own-save" },
  { wait: "add-pet", timeout: 30_000 },
  { invite: "add-pet", text: "Now add a pet yourself" },
];

/** The owner checks Tender Strips (chicken jerky) for Max, allergic to chicken: the red DANGER screen. */
const TREAT_OWNER_SCRIPT: ScriptStep[] = [
  { tap: "treat-pet-*" },
  { tap: "treat-snap" },
  { tap: "sample-chicken_jerky" },
  { tap: "media-confirm-use" },
  { wait: "treat-danger", timeout: AI_MS },
  { pause: 3_000 },
  { tap: "treat-danger-acknowledge" },
  { wait: "treat-result-danger" },
  { pause: 3_000 },
];

/** Then the sitter checks Crunchy Bites (animal fat) for Max: a WARNING. */
const TREAT_SITTER_SCRIPT: ScriptStep[] = [
  { tap: "treat-pet-*" },
  { tap: "treat-snap" },
  { tap: "sample-animal_fat_biscuit" },
  { tap: "media-confirm-use" },
  { wait: "treat-result-*", timeout: AI_MS },
  { pause: 3_000 },
];

const TRY_ANOTHER_TREAT: ScriptStep[] = [{ invite: "treat-snap", text: "Tap Check another treat and try one" }];

/**
 * Book in chat, the two phones taking turns (the chat is live on both, and `signal` / `until` pass the turn): the owner
 * finds Chloe and starts the chat (that is the booking request), Chloe says yes and answers with an AI draft, they set
 * a Meet & Greet and mark it done, both accept, Chloe says it was nice to meet, sends the final quote, and the owner
 * confirms and pays. The judge sets keep the story names, Robert and Chloe.
 */
/** One chat message the way the app means it: wait for the AI chips, tap the best fit, let the AI write the draft, Send. */
function chipMessage(prefer: string): ScriptStep[] {
  return [
    { gone: "chat-chips-loading", timeout: AI_MS },
    { tapBest: "chat-chip-*", prefer, timeout: AI_MS },
    { gone: "chat-chips-loading", timeout: AI_MS },
    { filled: "chat-input", timeout: AI_MS },
    { pause: 2_000 },
    { tap: "chat-send" },
  ];
}

const CHAT_OWNER_SCRIPT: ScriptStep[] = [
  { tap: "sitter-tile-Chloe" },
  { tap: "start-chat" },
  { wait: "chat-bubble-me", timeout: 30_000 },
  { pause: 1_500 },
  { signal: "asked" },
  { until: "said-yes" },
  // Chloe's answer is on this phone too before the chips are read (they belong to the latest message).
  { count: "chat-bubble-them", n: 1, timeout: 30_000 },
  { pause: 1_500 },
  ...chipMessage("allerg|chicken|food|care"),
  { signal: "allergy" },
  { until: "meet-requested" },
  { tap: "meet-accept", timeout: 30_000 },
  { signal: "meet-accepted" },
  { until: "met" },
  { tap: "chat-next-agree", timeout: 30_000 },
  { tap: "agree-submit" },
  { signal: "owner-agreed" },
  { until: "quote-sent" },
  { pause: 2_000 },
  { tap: "quote-confirm", timeout: 30_000 },
  { tap: "chat-next-pay", timeout: 30_000 },
  { wait: "checkout-title", timeout: 30_000 },
  { tap: "checkout-agree-all" },
  { type: "checkout-signer", text: "Robert" },
  { pause: 1_000 },
  { tap: "checkout-pay" },
];

const CHAT_SITTER_SCRIPT: ScriptStep[] = [
  { until: "asked" },
  // The chat list loads once; a fresh load shows Robert's new chat.
  { open: "/sitter/chat" },
  { tap: "chat-row-Robert", timeout: 30_000 },
  { wait: "chat-bubble-them" },
  { pause: 2_000 },
  // A yes chip: the AI reads the draft as a yes and the Meet & Greet card comes up.
  ...chipMessage("yes|available|happy|can take|sure"),
  { signal: "said-yes" },
  { until: "allergy" },
  { count: "chat-bubble-them", n: 2, timeout: 30_000 },
  { pause: 1_500 },
  // Chloe answers the allergy question the same way.
  ...chipMessage("allerg|chicken|no problem|of course|careful"),
  { tap: "meet-request", timeout: AI_MS },
  { tapIf: "meet-spot-nearby" },
  { tap: "meet-send" },
  { signal: "meet-requested" },
  { until: "meet-accepted" },
  { pause: 1_500 },
  { tap: "meet-done", timeout: 30_000 },
  { tap: "meet-done-early-confirm" },
  { signal: "met" },
  { tap: "chat-next-accept", timeout: 30_000 },
  { until: "owner-agreed" },
  { wait: "chat-agreement-card", timeout: 30_000 },
  ...chipMessage("nice|meet|great|thank|lovely"),
  { pause: 1_500 },
  { tap: "chat-next-final_quote", timeout: 30_000 },
  { tap: "send-quote-submit" },
  { signal: "quote-sent" },
];

/** Feed, walk, potty, nap from the pet room, then the day's page written from the chips and sent. */
const CARE_SCRIPT: ScriptStep[] = [
  { tap: "home-pager-tab-1" },
  { tap: "pet-action-*-feed" },
  { pause: 800 },
  { tap: "pet-action-*-walk" },
  { pause: 800 },
  { tap: "pet-action-*-potty" },
  { pause: 800 },
  { tap: "pet-action-*-nap" },
  { pause: 1_500 },
  { open: "/sitter/feed?view=diary" },
  { wait: "report-chip-*", timeout: AI_MS },
  { pause: 1_500 },
  { tap: "report-generate-*" },
  { filled: "report-body-*", timeout: AI_MS },
  { pause: 2_000 },
  { tap: "report-send-*" },
  { wait: "report-sent-*" },
];

export const SCENES: Scene[] = [
  {
    key: "meet",
    title: "Meet the pet",
    hint: "Add a pet by voice and a photo.",
    // From no pets at all, the scene adds one pet (Coco), then invites the judge to add their own.
    state: "empty",
    lead: "owner",
    // Add pet is the sign-up questions for one pet (#367): voice, photo, breed and coat, then breed needs.
    owner: { path: "/owner-onboarding?add=1", highlight: "own-species-dog", script: MEET_SCRIPT },
    sitter: SITTER_HOME,
    tags: [{ label: "Groq Whisper" }, NANO, VISION, TAVILY],
  },
  {
    key: "treat",
    title: "Treat check",
    hint: "Max is allergic to chicken. The owner checks a treat, then the sitter.",
    // In care, so the sitter has Max to check for too.
    state: "in_care",
    lead: "owner",
    owner: { path: "/owner/snap/treat", highlight: "treat-snap", script: TREAT_OWNER_SCRIPT, finale: TRY_ANOTHER_TREAT },
    sitter: { path: "/sitter/snap/treat", script: TREAT_SITTER_SCRIPT, after: true, finale: TRY_ANOTHER_TREAT },
    tags: [VISION, { label: "Rule table" }, TAVILY, ULTRA],
    intro: {
      title: "Treat check",
      body: "Max is allergic to chicken. Snap the ingredients on a treat or food, and Goldito catches what is easy to miss. The owner checks one, then the sitter.",
      note: "AI can make mistakes. Always double-check.",
    },
    // 50% faster than half speed (2): still slow enough to follow.
    pace: 4 / 3,
  },
  {
    key: "chat",
    title: "Book in chat",
    hint: "Robert asks Chloe, they meet, both accept, and Robert pays.",
    // Before the two have met: the chat is where it all starts.
    state: "pets",
    lead: "owner",
    owner: { path: "/owner/bookings", script: CHAT_OWNER_SCRIPT },
    sitter: { path: "/sitter/chat", script: CHAT_SITTER_SCRIPT },
    tags: [SUPER, NANO],
  },
  {
    key: "care",
    title: "A day of care",
    hint: "Tap feed, walk, potty, nap. Then write the page from the chips.",
    state: "in_care",
    lead: "sitter",
    owner: OWNER_HOME,
    sitter: { path: "/sitter", highlight: "checkin-tiles", script: CARE_SCRIPT },
    tags: [SUPER, VISION],
  },
  {
    key: "home",
    title: "Home safe",
    hint: "Tap Returned. The owner sees Home safe and the Life Record.",
    state: "in_care",
    lead: "sitter",
    owner: {
      path: "/owner/bookings/{booking}",
      highlight: "home-safe",
      script: [{ wait: "home-safe", timeout: AI_MS }, { wait: "life-record-*", timeout: AI_MS }],
    },
    sitter: {
      path: "/sitter/bookings/{booking}",
      highlight: "handoff-returned",
      script: [{ pause: 1_500 }, { tap: "handoff-returned" }, { tap: "return-confirm" }],
    },
    tags: [SUPER, { label: "Qwen3 Embedding" }],
  },
  {
    key: "mood",
    title: "Mood",
    hint: "Pick a pet photo.",
    state: null,
    lead: "owner",
    owner: {
      path: "/owner/snap/mood",
      highlight: "mood-pick",
      script: [{ tap: "mood-pick" }, { tap: "sample-mood_tug" }, { wait: "mood-result", timeout: AI_MS }],
    },
    sitter: SITTER_HOME,
    tags: [VISION, NANO],
    more: true,
  },
  {
    key: "trip",
    title: "Live trip",
    hint: "Watch the drive and the ETA.",
    state: "ready",
    lead: "owner",
    owner: { path: "/owner/bookings/{booking}/trip" },
    sitter: { path: "/sitter/bookings/{booking}/trip" },
    tags: [{ label: "No AI" }],
    play: { label: "Play the drive", role: "owner", what: "drive" },
    autoPlay: true,
    more: true,
  },
  {
    key: "sticker",
    title: "Sticker",
    hint: "Pick a photo and cut the pet out.",
    state: null,
    lead: "owner",
    owner: { path: "/owner/snap/sticker" },
    sitter: SITTER_HOME,
    tags: [{ label: "MediaPipe, in the browser" }],
    more: true,
  },
];

/** Reset: the clean stay a judge starts from, both phones home. */
export const RESET_SCENE: Scene = {
  key: "reset",
  title: "Reset",
  hint: "",
  state: "pets",
  lead: "owner",
  owner: OWNER_HOME,
  sitter: SITTER_HOME,
  tags: [],
};
