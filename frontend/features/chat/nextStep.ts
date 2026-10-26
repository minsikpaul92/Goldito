import type { BookingSummary } from "../../lib/bookings";
import { meetGreetPrimary } from "../../lib/meetGreet";
import type { ChatCard, ChatMessage } from "./chatApi";

type QuoteCard = Extract<ChatCard, { type: "quote" }>;

export type Role = "owner" | "sitter";

/** The one thing that is this person's turn (3D.7). The chat footer shows it; the cards show what happened. */
export type Primary =
  | { kind: "request"; label: string }
  | { kind: "interest"; label: string }
  | { kind: "meet"; label: string }
  | { kind: "agree"; label: string }
  | { kind: "accept"; label: string }
  | { kind: "final_quote"; label: string }
  | { kind: "confirm_quote"; label: string; messageId: string; disabled: boolean }
  | { kind: "pay"; label: string; total: number | null };

export type NextStep = {
  primary: Primary | null;
  /** The sitter can still price the stay while another step is the main one (a quote before the first yes). */
  quote: boolean;
  /** "Waiting for Chloe" when the turn is the other person's. */
  wait: string | null;
};

type Input = {
  role: Role;
  /** The pair's newest booking that still has a progress bar (null: none, or only an ended one). */
  booking: BookingSummary | null;
  messages: ChatMessage[];
  /** A stay or request card is in the chat: the sitter has something to price. */
  hasStay: boolean;
  /** A quote that is not replaced already prices the stay on the latest card. */
  priced: boolean;
  otherName: string;
  now?: number;
};

const money = (n: number) => `$${n.toFixed(2)}`;

/** The final quote: the newest open or confirmed quote posted after the booking's payment card. */
export function finalQuote(messages: ChatMessage[], bookingId: string): { id: string; card: QuoteCard } | null {
  const at = messages.findIndex((m) => m.card?.type === "payment" && m.card.bookingId === bookingId);
  if (at < 0) return null;
  const after = messages
    .slice(at + 1)
    .filter((m) => m.card?.type === "quote" && m.card.status !== "replaced")
    .at(-1);
  return after ? { id: after.id, card: after.card as QuoteCard } : null;
}

/** Whether the payment card has a final quote to wait for: a booking made outside the chat has no card, so no wait. */
export function hasPaymentCard(messages: ChatMessage[], bookingId: string): boolean {
  return messages.some((m) => m.card?.type === "payment" && m.card.bookingId === bookingId);
}

/**
 * Whether an action the server pointed at (chat-chips `action`) is possible on this screen right now. The server worked
 * it out from the database; this checks the same thing against what the footer would offer, so a chip can never open
 * something the person cannot do (a stale answer, a step someone else just took).
 */
export function actionPossible(id: string, step: NextStep, booking: BookingSummary | null, role: Role, now?: number): boolean {
  const kind = step.primary?.kind;
  const meet = booking ? meetGreetPrimary(booking, role, now)?.key : undefined;
  switch (id) {
    case "request_booking":
      return kind === "request";
    case "send_quote":
      return step.quote;
    case "interest":
      return kind === "interest";
    case "meet_time":
      return meet === "schedule";
    case "meet_accept":
      return meet === "accept";
    case "meet_skip":
      // The owner may ask before the sitter's first yes (015f).
      return (
        !!booking &&
        (booking.stage === "meet_greet" || (booking.stage === "requested" && role === "owner")) &&
        ["required", "proposed", "agreed"].includes(booking.meetGreetStatus)
      );
    case "agree":
      return kind === "agree";
    case "accept":
      return kind === "accept";
    case "final_quote":
      return kind === "final_quote";
    case "confirm_quote":
      return step.primary?.kind === "confirm_quote" && !step.primary.disabled;
    case "pay":
      return kind === "pay";
    default:
      return false;
  }
}

export function nextStep(i: Input): NextStep {
  const { role, booking, messages, hasStay, priced, otherName } = i;
  const waiting = `Waiting for ${otherName}`;
  const quote = role === "sitter" && hasStay && !priced;
  const none: NextStep = { primary: null, quote: false, wait: null };

  if (!booking || ["completed", "declined", "cancelled"].includes(booking.stage)) {
    if (role === "owner") return { primary: { kind: "request", label: "Request booking" }, quote: false, wait: null };
    return { ...none, quote };
  }

  switch (booking.stage) {
    case "requested":
      // A first-time request: the owner picks Request or Skip Meet & Greet on the card (015f, #236); the sitter can
      // still give the first yes before that.
      return role === "sitter" ? { primary: { kind: "interest", label: "Next" }, quote, wait: null } : none;

    case "meet_greet": {
      const step = meetGreetPrimary(booking, role, i.now);
      if (step) return { primary: { kind: "meet", label: step.label }, quote, wait: null };
      return { primary: null, quote, wait: booking.nextActor === role || booking.nextActor === "both" ? null : waiting };
    }

    case "confirm":
      if (role === "owner" && !booking.ownerAgreedAt) return { primary: { kind: "agree", label: "Accept" }, quote: false, wait: null };
      if (role === "sitter" && !booking.sitterAcceptedAt) return { primary: { kind: "accept", label: "Accept" }, quote, wait: null };
      return { primary: null, quote: false, wait: waiting };

    case "awaiting_payment": {
      // Confirmed by both. A chat booking goes quote, confirm, pay; one made outside the chat has no payment card.
      if (!hasPaymentCard(messages, booking.id)) {
        return role === "owner"
          ? { primary: { kind: "pay", label: "Pay", total: null }, quote: false, wait: null }
          : { primary: null, quote: false, wait: waiting };
      }
      const final = finalQuote(messages, booking.id);
      if (!final) {
        return role === "sitter"
          ? { primary: { kind: "final_quote", label: "Send final quote" }, quote: false, wait: null }
          : { primary: null, quote: false, wait: waiting };
      }
      if (final.card.status === "sent") {
        return role === "owner"
          ? {
              primary: {
                kind: "confirm_quote",
                label: "Accept",
                messageId: final.id,
                disabled: final.card.extras.some((e) => e.status === "offered"),
              },
              quote: false,
              wait: null,
            }
          : { primary: null, quote: false, wait: waiting };
      }
      return role === "owner"
        ? { primary: { kind: "pay", label: `Pay ${money(final.card.total)}`, total: final.card.total }, quote: false, wait: null }
        : { primary: null, quote: false, wait: waiting };
    }

    default:
      return none;
  }
}
