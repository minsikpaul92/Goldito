import type { Role } from "../../providers/SessionProvider";
import { VISION, NANO, SUPER, SceneTag, TAVILY, ULTRA } from "./judgeScenes";

/**
 * The judge panel's Map (Mook, Oct 27): every feature a judge can open, by stage of the stay, so they can search
 * ("treat", "live trip", "medication") or filter instead of hunting through tabs. A feature with a `scene` runs that
 * scene (reset + open + outline); the others open `path` on the `lead` phone as the stay is now.
 * Paths may hold `{booking}`, `{chat}`, `{pet}` (the owner's first pet) or `{sitter}` (the booking's sitter).
 * Same list as the design site's feature map (judge-map.html); keep the two in step.
 */

export type MapStage = "start" | "ask" | "meet" | "book" | "care" | "home" | "snap";

export type MapFeature = {
  key: string;
  stage: MapStage;
  title: string;
  /** One short line: what it does. */
  line: string;
  who: Role | "both";
  lead: Role;
  path: string;
  /** Runs this judge scene instead of opening `path`. */
  scene?: string;
  tags: SceneTag[];
  /** Extra words people might search for. */
  words: string;
};

export const MAP_STAGES: { key: MapStage; label: string }[] = [
  { key: "start", label: "Start" },
  { key: "ask", label: "1 Ask" },
  { key: "meet", label: "2 Meet" },
  { key: "book", label: "3 Book" },
  { key: "care", label: "4 Care" },
  { key: "home", label: "5 Home safe" },
  { key: "snap", label: "Snap" },
];

const QWEN: SceneTag = { label: "Qwen3 Embedding" };
const WHISPER: SceneTag = { label: "Groq Whisper" };

export const MAP_FEATURES: MapFeature[] = [
  { key: "addpet", stage: "start", title: "Add a pet by voice or photo", line: "Breed, coat and needs fill in, with sources.", who: "owner", lead: "owner", path: "/owner-onboarding?add=1", scene: "meet", tags: [WHISPER, NANO, VISION, TAVILY], words: "pet profile breed voice speak photo" },
  { key: "pet", stage: "start", title: "Your pet and its 8-bit twin", line: "The pet's profile, needs and pixel look.", who: "owner", lead: "owner", path: "/owner/pets/{pet}", tags: [], words: "tamagotchi pixel room look profile" },

  { key: "profile", stage: "ask", title: "Sitter profile and openings", line: "Reviews, policies and the next open dates.", who: "owner", lead: "owner", path: "/owner/sitters/{sitter}", tags: [], words: "find sitter search calendar rates" },
  { key: "ask", stage: "ask", title: "Ask before booking", line: "Pick dates and pets; the chat opens with the request.", who: "owner", lead: "owner", path: "/owner/bookings/new", tags: [], words: "inquiry request dates book" },
  { key: "reply", stage: "ask", title: "Book in chat, with AI replies", line: "Chips and a draft in your words; the sitter's side answers.", who: "both", lead: "owner", path: "{chat}", scene: "chat", tags: [SUPER, NANO], words: "inquiry auto reply chat chips draft quote price" },

  { key: "care", stage: "meet", title: "Care notes to checklist", line: "How your pet is cared for becomes a checklist.", who: "owner", lead: "owner", path: "/owner/pets/{pet}/care-request", tags: [SUPER], words: "care plan medication checklist heads up" },
  { key: "steps", stage: "meet", title: "The booking and its steps", line: "Request, Meet, Confirm, Pay, Care, and whose turn it is.", who: "both", lead: "owner", path: "/owner/bookings/{booking}", tags: [], words: "stepper progress stage status meet greet" },
  { key: "requests", stage: "meet", title: "The sitter's requests", line: "New asks, held dates and what waits on her.", who: "sitter", lead: "sitter", path: "/sitter/bookings", tags: [], words: "bookings inbox requests" },

  { key: "bookings", stage: "book", title: "Bookings", line: "Every stay with its step.", who: "owner", lead: "owner", path: "/owner/bookings", tags: [], words: "booking list status" },
  { key: "entry", stage: "book", title: "Entry info that unlocks on time", line: "The door code opens for the sitter 2 hours before.", who: "owner", lead: "owner", path: "/owner/home-access", tags: [], words: "door code key lock safety home access" },
  { key: "schedule", stage: "book", title: "Sitter schedule and rules", line: "Open days and the rules quotes come from.", who: "sitter", lead: "sitter", path: "/sitter/schedule", tags: [], words: "calendar availability rules" },

  { key: "day", stage: "care", title: "A day of care", line: "Tap meal, walk, potty, nap; the Diary page writes itself.", who: "both", lead: "sitter", path: "/sitter", scene: "care", tags: [SUPER, VISION], words: "check in 5-second quick diary daily report page" },
  { key: "trip", stage: "care", title: "Live trip with ETA", line: "Watch the drive and the arrival.", who: "both", lead: "owner", path: "/owner/bookings/{booking}/trip", scene: "trip", tags: [{ label: "No AI" }], words: "map uber drive transport eta location handoff" },
  { key: "meds", stage: "care", title: "Meds and tasks", line: "Tick each med on time; the owner sees it.", who: "sitter", lead: "sitter", path: "/sitter/tasks", tags: [], words: "medication pill task checklist" },
  { key: "moments", stage: "care", title: "Moments: photos by day", line: "Photos with a caption and a category.", who: "owner", lead: "owner", path: "/owner/feed", tags: [VISION], words: "photo album feed caption gallery" },
  { key: "diary", stage: "care", title: "The Diary", line: "Each day's page from the sitter.", who: "owner", lead: "owner", path: "/owner/diary", tags: [SUPER], words: "daily report page journal" },
  { key: "home", stage: "care", title: "Home during a stay", line: "Where your pet is and how the day went.", who: "owner", lead: "owner", path: "/owner", tags: [], words: "owner home dashboard" },
  { key: "notif", stage: "care", title: "Notifications", line: "Every update, by day of the stay.", who: "owner", lead: "owner", path: "/owner/notifications", tags: [], words: "alerts updates bell" },

  { key: "homesafe", stage: "home", title: "Home safe and the Life Record", line: "Returned, then Home safe and the pet's record.", who: "both", lead: "sitter", path: "/sitter/bookings/{booking}", scene: "home", tags: [SUPER, QWEN], words: "return pick up end of stay record memory rag" },
  { key: "review", stage: "home", title: "Reviews both ways", line: "The owner reviews the sitter; she reviews each pet.", who: "both", lead: "owner", path: "/owner/bookings/{booking}/review", tags: [], words: "rating stars review" },
  { key: "record", stage: "home", title: "Pet Life Record", line: "Eats, meds, behaviour and tips, with sources.", who: "owner", lead: "owner", path: "/owner/pets/{pet}/record", tags: [SUPER, QWEN], words: "life record memory history rag" },
  { key: "history", stage: "home", title: "History", line: "Every past stay.", who: "owner", lead: "owner", path: "/owner/history", tags: [], words: "past stays" },

  { key: "treat", stage: "snap", title: "Treat check", line: "Chicken jerky for Max shows a red DANGER screen.", who: "both", lead: "owner", path: "/owner/snap/treat", scene: "treat", tags: [VISION, { label: "Rule table" }, TAVILY, ULTRA], words: "safety allergy food ingredient scan label danger" },
  { key: "mood", stage: "snap", title: "Mood from a photo", line: "A face and one sentence about the pet.", who: "both", lead: "owner", path: "/owner/snap/mood", scene: "mood", tags: [VISION, NANO], words: "emotion feeling photo" },
  { key: "sticker", stage: "snap", title: "Stickers", line: "Cut the pet out of a photo.", who: "both", lead: "owner", path: "/owner/snap/sticker", scene: "sticker", tags: [{ label: "MediaPipe, in the browser" }], words: "decorate cutout sticker fun" },
];

/** Features that match every word of `query`, for `who` ("all" for everyone) and only AI ones when `aiOnly`. */
export function filterFeatures(query: string, who: Role | "all", aiOnly: boolean): MapFeature[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return MAP_FEATURES.filter((f) => {
    if (who !== "all" && f.who !== "both" && f.who !== who) return false;
    const ai = f.tags.some((t) => t.label !== "No AI");
    if (aiOnly && !ai) return false;
    const hay = [f.title, f.line, f.words, f.who, ...f.tags.map((t) => t.label), ai ? "ai model nvidia" : ""].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
