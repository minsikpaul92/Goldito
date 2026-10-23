/** The Snap tab's tools (Phase 12, D61): one place for the cards to read. */
export type SnapTool = "treat" | "mood" | "sticker";

/** `blurb` names the pet picked on the Snap tab ("your pet" while there is none). */
export const SNAP_TOOLS: { key: SnapTool; title: string; blurb: (pet: string) => string }[] = [
  { key: "treat", title: "Treat check", blurb: (pet) => `Snap the label. We check ${pet}'s allergies and toxins.` },
  { key: "mood", title: "Mood", blurb: (pet) => `How does ${pet} seem today? Just for fun.` },
  { key: "sticker", title: "Sticker", blurb: (pet) => `Cut ${pet} out and decorate a diary page.` },
];
