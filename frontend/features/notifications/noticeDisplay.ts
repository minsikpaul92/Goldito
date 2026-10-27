import type { IconName } from "../../components/ui/Icon";
import type { AppNotification } from "../../lib/notifications";
import type { Role } from "../../providers/SessionProvider";
import { addDays, appToday, formatDay, isoToZoned } from "../schedule/dates";

// Emoji, variation selectors and joiners. Ranges rather than \p{…} so every JS engine we ship on reads it.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** A notice line without its emoji (the drawn icon says what it is), spaces tidied. */
export function plainText(text: string): string {
  return text.replace(EMOJI, "").replace(/\s+·\s*$/, "").replace(/\s{2,}/g, " ").trim();
}

export type NoticeTone = "mint" | "peach" | "butter" | "blush";

/** The drawn icon and its tinted square for a notice, by what it is about. */
export function noticeIcon(n: Pick<AppNotification, "type" | "title">): { icon: IconName; tone: NoticeTone } {
  const { type, title } = n;
  if (type === "feed_post" || type === "photo_request_fulfilled") return { icon: "camera", tone: "mint" };
  if (type === "report_sent") return { icon: "diary", tone: "peach" };
  if (type === "task_done") return /medic|pill|dose/i.test(title) ? { icon: "pill", tone: "blush" } : { icon: "check", tone: "butter" };
  if (type === "care_checkin") {
    const t = title.toLowerCase();
    if (/ ate |meal/.test(t)) return { icon: "meal", tone: "butter" };
    if (/walk/.test(t)) return { icon: "walk", tone: "butter" };
    if (/potty/.test(t)) return { icon: "potty", tone: "butter" };
    if (/nap|woke/.test(t)) return { icon: "nap", tone: "butter" };
    if (/seems|missing/.test(t)) return { icon: "heart", tone: "butter" };
    return { icon: "check", tone: "butter" };
  }
  if (type.startsWith("care_request") || type === "care_counter_accepted") return { icon: "tip", tone: "peach" };
  if (type.startsWith("inquiry")) return { icon: "chat", tone: "mint" };
  if (type.startsWith("meet_greet") || type === "booking_interest") return { icon: "people", tone: "mint" };
  if (type.startsWith("handoff") || type.startsWith("trip") || type === "pet_dropped_off" || type === "pet_picked_up")
    return { icon: "car", tone: "mint" };
  if (type.startsWith("review")) return { icon: "heart", tone: "blush" };
  if (type === "checkout_needed" || type === "price_updated" || type === "booking_paid" || type === "booking_refunded")
    return { icon: "price", tone: "peach" };
  if (type.startsWith("booking") || type === "access_unlocked") return { icon: "calendar", tone: "mint" };
  return { icon: "bell", tone: "mint" };
}

const OWNER_ACTIONS: Record<string, string> = {
  report_sent: "Read",
  feed_post: "See",
  photo_request_fulfilled: "See",
  checkout_needed: "Pay",
  review_requested: "Review",
  inquiry_needs_you: "Reply",
  meet_greet_proposed: "Reply",
  meet_greet_skip_requested: "Reply",
  handoff_proposed: "Reply",
  booking_agree_requested: "Reply",
  care_request_countered: "Reply",
};

const SITTER_ACTIONS: Record<string, string> = {
  feed_post: "See",
  review_requested: "Review",
  booking_requested: "Reply",
  inquiry_received: "Reply",
  inquiry_needs_you: "Reply",
  meet_greet_proposed: "Reply",
  meet_greet_skip_requested: "Reply",
  handoff_proposed: "Reply",
  care_request: "Reply",
};

/** The small word on a row that needs the viewer ("Read", "Reply"); tapping it does what tapping the row does. */
export function noticeAction(type: string, role: Role): string | null {
  return (role === "owner" ? OWNER_ACTIONS : role === "sitter" ? SITTER_ACTIONS : {})[type] ?? null;
}

/** One check-in title part ("Max had a 20-minute walk 🦮") → its short word ("walk 20 min"). */
function checkinWord(part: string): string {
  const t = part.toLowerCase();
  const walk = t.match(/(\d+)-minute walk/);
  if (walk) return `walk ${walk[1]} min`;
  if (/ ate |skipped the meal|meal update/.test(t)) return "meal";
  if (/potty/.test(t)) return "potty";
  if (/seems|missing you/.test(t)) return "mood";
  if (/nap/.test(t)) return "nap";
  if (/woke/.test(t)) return "woke up";
  return "note";
}

/** The pet's name from a check-in title, when the title starts with it or ends with "for Max". */
function checkinPet(title: string): string | null {
  const t = plainText(title).split(" · ")[0];
  const lead = t.match(/^(.+?) (?:ate|had|seems|is|woke|skipped)\b/);
  if (lead) return lead[1];
  const tail = t.match(/(?:for|about) ([^:]+)/);
  return tail ? tail[1].trim() : null;
}

/** "Meal, walk 20 min, potty": what a run of check-ins logged, oldest first, each kind once. */
export function checkinSummary(notices: Pick<AppNotification, "title" | "createdAt">[]): string {
  const words: string[] = [];
  for (const n of [...notices].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    for (const part of n.title.split(" · ")) {
      const w = checkinWord(part);
      if (!words.includes(w)) words.push(w);
    }
  }
  const line = words.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

export function checkinFoldTitle(notices: Pick<AppNotification, "title">[]): string {
  const pet = checkinPet(notices[0].title);
  return `${notices.length} check-ins${pet ? ` for ${pet}` : ""}`;
}

export type NoticeEntry =
  | { kind: "one"; notice: AppNotification }
  | { kind: "fold"; key: string; notices: AppNotification[] };

export type NoticeDay = { day: string; label: string; entries: NoticeEntry[] };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Today", "Yesterday", or "Sat, Oct 25" (app timezone). */
export function dayLabel(day: string, today: string = appToday()): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return `${WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]}, ${formatDay(day)}`;
}

/**
 * The list as day cards, newest day first. Within a day, two or more check-ins of the same pet fold into one row
 * (kept where the newest of them was); everything else stays one row per notice, newest first.
 */
export function groupNotices(items: AppNotification[], today: string = appToday()): NoticeDay[] {
  const days: NoticeDay[] = [];
  for (const n of items) {
    const day = isoToZoned(n.createdAt).day;
    let group = days.find((d) => d.day === day);
    if (!group) {
      group = { day, label: dayLabel(day, today), entries: [] };
      days.push(group);
    }
    group.entries.push({ kind: "one", notice: n });
  }
  for (const group of days) {
    const byPet = new Map<string, AppNotification[]>();
    for (const e of group.entries) {
      if (e.kind === "one" && e.notice.type === "care_checkin" && e.notice.petId) {
        byPet.set(e.notice.petId, [...(byPet.get(e.notice.petId) ?? []), e.notice]);
      }
    }
    const entries: NoticeEntry[] = [];
    const placed = new Set<string>();
    for (const e of group.entries) {
      const pet = e.kind === "one" && e.notice.type === "care_checkin" ? e.notice.petId : null;
      const run = pet ? byPet.get(pet) : undefined;
      if (!pet || !run || run.length < 2) {
        entries.push(e);
        continue;
      }
      if (placed.has(pet)) continue;
      placed.add(pet);
      entries.push({ kind: "fold", key: `${pet}-${group.day}`, notices: run });
    }
    group.entries = entries;
  }
  return days;
}
