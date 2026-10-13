/** The Snap tab's tools (Phase 12, D61): one place for the card and the tool screen to read. */
export type SnapTool = "treat" | "mood" | "sticker";

export const SNAP_TOOLS: { key: SnapTool; emoji: string; title: string; blurb: string; coming: string }[] = [
  {
    key: "treat",
    emoji: "🏷️",
    title: "Treat check",
    blurb: "Can my pet eat this? Snap the label.",
    coming: "Snap a treat label and we'll check it against your pet's allergies and foods that are unsafe for them.",
  },
  {
    key: "mood",
    emoji: "😊",
    title: "Mood",
    blurb: "How does my pet seem? For fun only.",
    coming: "Add a photo or a short clip and we'll box each pet and show how they seem — for fun only.",
  },
  {
    key: "sticker",
    emoji: "✂️",
    title: "Sticker",
    blurb: "Cut my pet out and decorate the diary.",
    coming: "Pick a photo, cut your pet out as a sticker, and use it to decorate the diary.",
  },
];

export function snapTool(key: SnapTool) {
  return SNAP_TOOLS.find((tool) => tool.key === key)!;
}
