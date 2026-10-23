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
  /** Input hints: lighter than textMuted so they never read as typed values, still 4.5:1 on white. */
  placeholder: string;
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
    placeholder: tokens.color.textMuted,
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
    placeholder: "#7A746B",
  },
  /** The app's look (Mook's Expressive): ink on cream, mint accent, warm tan lines. `default` is the earlier look. */
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
    // 4.7:1 on white.
    placeholder: "#807160",
  },
} satisfies Record<string, SkinColors>;

export type ThemeName = keyof typeof themes;

/** Font families a skin loads on top of the platform font (see `DisplayFont` in ThemeProvider). */
const skinFonts: Partial<Record<ThemeName, typeof tokens.fontFamily>> = {
  expressive: { display: "Fredoka_600SemiBold" },
};

/** Shape and chrome a skin may change (Expressive: pills, cream bars). `default` keeps the earlier look. */
export type SkinUi = {
  radius: { button: number; card: number; block: number; chip: number; segment: number; tag: number; stepper: number };
  /** Header bar and tab bar ground. */
  chrome: string;
  stepperBorder: string;
  stepperPressed: string;
  /** `pushed` = the selected tab looks pressed in; `pill` = a rounded white bar, a mint pill behind the selected icon. */
  tabs: "pushed" | "pill";
  /** Booking screens use tinted color blocks and the numbered stage dots. */
  blocks: boolean;
};

const r = tokens.radius;
const skinUi: Record<ThemeName, SkinUi> = {
  default: {
    radius: { button: r.md, card: r.lg, block: r.lg, chip: r.sm, segment: r.md, tag: r.sm, stepper: r.md },
    chrome: tokens.color.surface,
    stepperBorder: tokens.color.border,
    stepperPressed: tokens.color.accent,
    tabs: "pushed",
    blocks: false,
  },
  balanced: {
    radius: { button: r.md, card: r.lg, block: r.lg, chip: r.sm, segment: r.md, tag: r.sm, stepper: r.md },
    chrome: themes.balanced.surface,
    stepperBorder: themes.balanced.border,
    stepperPressed: themes.balanced.accent,
    tabs: "pushed",
    blocks: false,
  },
  expressive: {
    radius: { button: r.pill, card: r.lg, block: r.xl, chip: r.pill, segment: r.pill, tag: r.pill, stepper: r.pill },
    chrome: themes.expressive.background,
    stepperBorder: tokens.color.gold,
    stepperPressed: tokens.color.blockButter,
    tabs: "pill",
    blocks: true,
  },
};

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && Object.hasOwn(themes, value);
}

export type Theme = Omit<typeof tokens, "color"> & {
  name: ThemeName;
  color: Omit<typeof tokens.color, keyof SkinColors> & SkinColors;
  ui: SkinUi;
};

export function buildTheme(name: ThemeName): Theme {
  return {
    ...tokens,
    name,
    color: { ...tokens.color, ...themes[name] },
    fontFamily: { ...tokens.fontFamily, ...skinFonts[name] },
    ui: skinUi[name],
  };
}
