/** The Snap tab's tools (Phase 12, D61): one place for the cards to read. */
export type SnapTool = "treat" | "mood" | "sticker";

export const SNAP_TOOLS: { key: SnapTool; emoji: string; title: string; blurb: string }[] = [
  { key: "treat", emoji: "🏷️", title: "Treat check", blurb: "Can my pet eat this? Snap the label." },
  { key: "mood", emoji: "😊", title: "Mood", blurb: "How does my pet seem? For fun only." },
  { key: "sticker", emoji: "✂️", title: "Sticker", blurb: "Cut my pet out and decorate the diary." },
];
