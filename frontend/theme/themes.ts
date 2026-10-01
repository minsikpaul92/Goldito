import { tokens } from "./tokens";

/**
 * The only colors a theme (pet skin, Phase 11.10) may change.
 * `text`, `error`, `success`, and `warning` are deliberately not here: status colors
 * stay fixed so a DANGER warning can never blend into a skin.
 */
export type SkinColors = {
  primary: string;
  primaryText: string;
  background: string;
  accent: string;
};

/** Theme presets. Coat-color skins (6–8, from the designer) are added here in 11.10. */
export const themes = {
  default: {
    primary: tokens.color.primary,
    primaryText: tokens.color.primaryText,
    background: tokens.color.background,
    accent: tokens.color.accent,
  },
} satisfies Record<string, SkinColors>;

export type ThemeName = keyof typeof themes;

export type Theme = Omit<typeof tokens, "color"> & {
  name: ThemeName;
  color: Omit<typeof tokens.color, keyof SkinColors> & SkinColors;
};

export function buildTheme(name: ThemeName): Theme {
  return {
    ...tokens,
    name,
    color: { ...tokens.color, ...themes[name] },
  };
}
