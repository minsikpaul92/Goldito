import { tokens } from "./tokens";

/**
 * The only colors a theme (pet skin, Phase 11.10) may change — one Figma Color mode each.
 * `error`, `success`, and `warning` (and their surfaces) are deliberately not here: status
 * colors stay fixed so a DANGER warning can never blend into a skin. Skins may tint `text`
 * and `textMuted` only within dark, readable values (Figma `Balanced`).
 */
export type SkinColors = {
  primary: string;
  primaryText: string;
  background: string;
  accent: string;
  /** Cards, sheets, inputs. */
  surface: string;
  border: string;
  borderStrong: string;
  track: string;
  text: string;
  textMuted: string;
};

/** Theme presets = the modes of the Figma Color collection. Coat-color skins (6–8, from the designer) are added here in 11.10. */
export const themes = {
  default: {
    primary: tokens.color.primary,
    primaryText: tokens.color.primaryText,
    background: tokens.color.background,
    accent: tokens.color.accent,
    surface: tokens.color.surface,
    border: tokens.color.border,
    borderStrong: tokens.color.borderStrong,
    track: tokens.color.track,
    text: tokens.color.text,
    textMuted: tokens.color.textMuted,
  },
  /** Warmer neutrals, same green (Figma mode `Balanced`). */
  balanced: {
    primary: "#2D6A4F",
    primaryText: "#FFFFFF",
    background: "#F4F2EE",
    accent: "#DCEDE3",
    surface: "#FFFFFF",
    border: "#E6E1D9",
    borderStrong: "#857E73",
    track: "#E6E1D9",
    text: "#1F1B16",
    textMuted: "#5E5850",
  },
  /** Mook's Expressive draft: ink on cream, mint accent, warm tan lines. Behind a flag (`?skin=expressive`). */
  expressive: {
    primary: "#1B4332",
    primaryText: "#FFFFFF",
    background: "#FBF6EA",
    accent: "#D8F3DC",
    surface: "#FFFFFF",
    border: "#E8DCC4",
    // 4.5:1 on cream.
    borderStrong: "#7F6F58",
    track: "#E8DCC4",
    text: "#1B4332",
    // 5.9:1 on cream.
    textMuted: "#6B5D4A",
  },
} satisfies Record<string, SkinColors>;

export type ThemeName = keyof typeof themes;

/** Font families a skin loads on top of the platform font (see `DisplayFont` in ThemeProvider). */
const skinFonts: Partial<Record<ThemeName, typeof tokens.fontFamily>> = {
  expressive: { display: "Fredoka_600SemiBold" },
};

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && Object.hasOwn(themes, value);
}

export type Theme = Omit<typeof tokens, "color"> & {
  name: ThemeName;
  color: Omit<typeof tokens.color, keyof SkinColors> & SkinColors;
};

export function buildTheme(name: ThemeName): Theme {
  return {
    ...tokens,
    name,
    color: { ...tokens.color, ...themes[name] },
    fontFamily: { ...tokens.fontFamily, ...skinFonts[name] },
  };
}
