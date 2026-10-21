import type { ImageSourcePropType } from "react-native";

/**
 * Muk's pixel pets. Drop a PNG into `frontend/assets/pixel-pets/` named like the key (`dog_golden_calm.png`) and add
 * one line here: `dog_golden_calm: require("../../../assets/pixel-pets/dog_golden_calm.png"),`. A key with no entry
 * is drawn in code (`sprites.ts`), so art can arrive one look at a time.
 */
export const PIXEL_PNGS: Record<string, ImageSourcePropType | undefined> = {};
