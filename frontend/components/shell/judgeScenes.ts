import type { DemoState } from "../../lib/demoReset";
import type { Role } from "../../providers/SessionProvider";

/**
 * The judge panel's scenes (#413), in story order. Each one resets the judge's set to `state` (null: keeps the stay),
 * opens `owner` and `sitter` on their phones (one phone shows the `lead` side), and outlines the control to tap.
 * Paths may hold `{booking}` (the set's latest booking) or be `{chat}` (the owner's chat with the set's sitter).
 * Tags name what really runs: Nemotron models (NVIDIA) apart from MiniCPM-V (OpenBMB), Qwen3, Groq Whisper and Tavily.
 */

export type SceneTarget = { path: string; highlight?: string };

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
  /** Folded under More. */
  more?: boolean;
};

const NANO: SceneTag = { label: "Nemotron Nano", nvidia: true };
const SUPER: SceneTag = { label: "Nemotron Super", nvidia: true };
const ULTRA: SceneTag = { label: "Nemotron Ultra", nvidia: true };
const MINICPM: SceneTag = { label: "MiniCPM-V" };
const TAVILY: SceneTag = { label: "Tavily" };

const SITTER_HOME: SceneTarget = { path: "/sitter" };
const OWNER_HOME: SceneTarget = { path: "/owner" };

export const SCENES: Scene[] = [
  {
    key: "meet",
    title: "Meet the pet",
    hint: "Add a new pet.",
    state: "pets",
    lead: "owner",
    // The current Add pet entry; it asks the sign-up questions (voice, photo, breed needs) once #367 lands.
    owner: { path: "/owner/pets/new", highlight: "pet-name" },
    sitter: SITTER_HOME,
    tags: [{ label: "Groq Whisper" }, NANO, MINICPM, TAVILY],
  },
  {
    key: "treat",
    title: "Treat check",
    hint: "Pick the chicken jerky label for Max.",
    state: "pets",
    lead: "owner",
    owner: { path: "/owner/snap/treat", highlight: "treat-snap" },
    sitter: SITTER_HOME,
    tags: [MINICPM, { label: "Rule table" }, TAVILY, ULTRA],
  },
  {
    key: "chat",
    title: "Book in chat",
    hint: "Tap a chip, check the draft, Send.",
    state: "past",
    lead: "owner",
    owner: { path: "{chat}", highlight: "chat-chips" },
    sitter: { path: "/sitter/chat" },
    tags: [SUPER, NANO],
    play: { label: "Play Chloe's reply", role: "sitter", what: "reply" },
  },
  {
    key: "care",
    title: "A day of care",
    hint: "Tap feed, walk, potty, nap. Then write the page from the chips.",
    state: "in_care",
    lead: "sitter",
    owner: OWNER_HOME,
    sitter: { path: "/sitter", highlight: "checkin-tiles" },
    tags: [SUPER, MINICPM],
  },
  {
    key: "home",
    title: "Home safe",
    hint: "Tap Returned. The owner sees Home safe and the Life Record.",
    state: "in_care",
    lead: "sitter",
    owner: { path: "/owner/bookings/{booking}", highlight: "home-safe" },
    sitter: { path: "/sitter/bookings/{booking}", highlight: "handoff-returned" },
    tags: [SUPER, { label: "Qwen3 Embedding" }],
  },
  {
    key: "mood",
    title: "Mood",
    hint: "Pick a pet photo.",
    state: null,
    lead: "owner",
    owner: { path: "/owner/snap/mood", highlight: "mood-pick" },
    sitter: SITTER_HOME,
    tags: [MINICPM, NANO],
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
