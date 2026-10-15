import { Asset } from "expo-asset";

/**
 * Goldito's own stickers for the picture diary (Phase 12.4): bundled PNGs, so they work without an upload. These are
 * placeholders drawn in code — replace a file under `assets/stickers/` with the designed one of the same name.
 * A preset is stored in a decor item as `preset:<id>` (both `sticker_id` and `public_id`).
 */
export type PresetSticker = { id: string; label: string; source: number };

export const PRESET_PREFIX = "preset:";

export const PRESET_STICKERS: PresetSticker[] = [
  { id: "heart", label: "Heart", source: require("../../assets/stickers/heart.png") },
  { id: "star", label: "Star", source: require("../../assets/stickers/star.png") },
  { id: "sun", label: "Sun", source: require("../../assets/stickers/sun.png") },
  { id: "cloud", label: "Cloud", source: require("../../assets/stickers/cloud.png") },
  { id: "paw", label: "Paw", source: require("../../assets/stickers/paw.png") },
  { id: "bone", label: "Bone", source: require("../../assets/stickers/bone.png") },
  { id: "ball", label: "Ball", source: require("../../assets/stickers/ball.png") },
  { id: "zzz", label: "Sleepy", source: require("../../assets/stickers/zzz.png") },
  { id: "best_day", label: "Best day!", source: require("../../assets/stickers/best_day.png") },
];

export const presetRef = (preset: PresetSticker) => `${PRESET_PREFIX}${preset.id}`;

export const isPreset = (ref: string) => ref.startsWith(PRESET_PREFIX);

/** The bundled file's URL for a `preset:<id>` ref ("" for an unknown one). */
export function presetUri(ref: string): string {
  const preset = PRESET_STICKERS.find((p) => presetRef(p) === ref);
  return preset ? Asset.fromModule(preset.source).uri : "";
}
