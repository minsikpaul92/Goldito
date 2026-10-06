/**
 * Fixed English consent templates for Checkout (phase-03c 3C.2, D30).
 * Versioned copy only — AI never writes these. Footer on every screen:
 * "Demo template — not legal advice".
 */

export type ConsentKind =
  | "emergency_vet"
  | "safe_return"
  | "handoff_rules"
  | "cohabitation"
  | "home_access";

export type ConsentTemplate = {
  kind: ConsentKind;
  version: string;
  title: string;
  summary: [string, string, string];
  body: string;
};

export const CONSENT_TEMPLATES: Record<ConsentKind, ConsentTemplate> = {
  emergency_vet: {
    kind: "emergency_vet",
    version: "1",
    title: "Emergency vet care",
    summary: [
      "The sitter may seek urgent vet care if needed.",
      "You set a spend limit for emergency treatment.",
      "Your named clinic is the preferred contact.",
    ],
    body: [
      "If your pet needs urgent veterinary care while in the sitter's care, you authorize",
      "the sitter to arrange treatment up to the emergency spend limit you confirm at",
      "signing. The sitter will try to reach you and your preferred clinic first when",
      "it is safe to do so. Costs above the limit need your separate approval unless a",
      "clinician says delay would put the pet at serious risk.",
      "",
      "This is a demo template for the Pawddy hackathon — not legal advice.",
    ].join("\n"),
  },
  safe_return: {
    kind: "safe_return",
    version: "1",
    title: "Who may receive the pet",
    summary: [
      "Only the named person may take the pet home.",
      "The sitter checks identity at pick-up.",
      "Change the receiver before the return handoff.",
    ],
    body: [
      "At the end of the stay, the sitter will return your pet only to the person named",
      "in this consent (or to you). If someone else arrives, the sitter may keep the pet",
      "until you confirm a change in the app. You are responsible for keeping the",
      "receiver name up to date before pick-up.",
      "",
      "This is a demo template for the Pawddy hackathon — not legal advice.",
    ].join("\n"),
  },
  handoff_rules: {
    kind: "handoff_rules",
    version: "1",
    title: "Drop-off and pick-up rules",
    summary: [
      "Arrive within the agreed handoff window.",
      "Follow visitor parking and building rules.",
      "Tell the sitter if you will be late.",
    ],
    body: [
      "Boarding handoffs happen at the agreed times and places. Please respect visitor",
      "parking, lobby, and building rules the sitter shares after payment. If you will",
      "be more than 15 minutes late, message the sitter in Pawddy so they can adjust.",
      "Repeated no-shows may lead the sitter to cancel the stay.",
      "",
      "This is a demo template for the Pawddy hackathon — not legal advice.",
    ].join("\n"),
  },
  cohabitation: {
    kind: "cohabitation",
    version: "1",
    title: "Sharing space with other pets",
    summary: [
      "Other pets may be in the sitter's home.",
      "Share allergies and temperament notes.",
      "The sitter separates pets when needed.",
    ],
    body: [
      "During boarding, your pet may share the sitter's home with other pets unless the",
      "sitter's policy says otherwise. Tell the sitter about allergies, fear, or",
      "reactivity in the care request. The sitter will use crates, rooms, or staggered",
      "schedules when that is safer. Serious incidents should be reported in the app.",
      "",
      "This is a demo template for the Pawddy hackathon — not legal advice.",
    ].join("\n"),
  },
  home_access: {
    kind: "home_access",
    version: "1",
    title: "Home access (lockbox, keys, buzzer)",
    summary: [
      "The sitter may use lockbox, keys, or fob as needed.",
      "Condo buzzer and entry steps are for this booking only.",
      "Codes unlock in the app two hours before arrival.",
    ],
    body: [
      "When care happens at your home (house sitting or a sitter-drive handoff), you",
      "authorize the booked sitter to use the entry method you save in Pawddy —",
      "lockbox code, keys, buzzer, or fob notes. Access details stay locked until two",
      "hours before the agreed arrival and lock again after the stay ends. Do not share",
      "real production codes in this demo; use obviously fake values.",
      "",
      "This is a demo template for the Pawddy hackathon — not legal advice.",
    ].join("\n"),
  },
};

export const DEMO_CONSENT_FOOTER = "Demo template — not legal advice";

/** Default emergency spend limit (CAD) when the owner profile has no custom value. */
export const DEFAULT_EMERGENCY_LIMIT_CAD = 500;
