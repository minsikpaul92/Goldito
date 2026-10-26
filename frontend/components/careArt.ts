import type { ArtName } from "../assets/art/artSvgs";
import type { CareCheckinKind, CareTaskType } from "../types/db";
import { Theme } from "../theme/themes";

/** What a care row is about: a task type, a check-in kind, a shared photo or a sent diary page. */
export type CareArtKey = CareTaskType | CareCheckinKind | "photo" | "report";

type Tint = "blockMint" | "blockPeach" | "blockButter" | "blockBlush";

const ART: Record<CareArtKey, { art: ArtName; tint: Tint }> = {
  medication: { art: "sitter/pill", tint: "blockBlush" },
  feeding: { art: "owner/care-bowl", tint: "blockPeach" },
  meal: { art: "owner/care-bowl", tint: "blockPeach" },
  walk: { art: "sitter/walk", tint: "blockMint" },
  litter: { art: "sitter/potty", tint: "blockButter" },
  potty: { art: "sitter/potty", tint: "blockButter" },
  play: { art: "snap/sticker-paw", tint: "blockButter" },
  sleep: { art: "feed/chip-naps", tint: "blockBlush" },
  nap: { art: "feed/chip-naps", tint: "blockBlush" },
  wake: { art: "feed/chip-naps", tint: "blockButter" },
  mood: { art: "snap/mood-heart", tint: "blockMint" },
  note: { art: "sitter/mood", tint: "blockMint" },
  photo: { art: "owner/camera", tint: "blockButter" },
  report: { art: "sitter/five-second", tint: "blockPeach" },
};

/** The drawing and the tile color for a care row (the Oct 25 design: one tinted square per kind). */
export function careArt(key: CareArtKey | undefined, theme: Theme): { art: ArtName; tint: string } {
  const found = ART[key ?? "note"] ?? ART.note;
  return { art: found.art, tint: theme.color[found.tint] };
}
