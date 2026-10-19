import { Fredoka_600SemiBold } from "@expo-google-fonts/fredoka/600SemiBold";
import { useFonts } from "expo-font";
import { ReactNode, createContext, useContext, useMemo, useState } from "react";
import { Platform } from "react-native";

import { Theme, ThemeName, buildTheme, isThemeName } from "../theme/themes";

/** The app's look. `default` is the earlier look, kept for debugging (`?skin=default`). */
const DEFAULT_SKIN: ThemeName = "expressive";

const ThemeContext = createContext<Theme>(buildTheme(DEFAULT_SKIN));

const SKIN_KEY = "goldito.skin";

/**
 * Skin switch: `?skin=<name>` on web (kept for the tab session), else EXPO_PUBLIC_THEME,
 * else DEFAULT_SKIN. `?skin=default` brings back the earlier look.
 */
function flaggedSkin(): ThemeName {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const param = new URLSearchParams(window.location.search).get("skin");
      if (isThemeName(param)) {
        window.sessionStorage.setItem(SKIN_KEY, param);
        return param;
      }
      const saved = window.sessionStorage.getItem(SKIN_KEY);
      if (isThemeName(saved)) return saved;
    } catch {
      // Storage blocked: the query param alone still works for this page load.
    }
  }
  const env = process.env.EXPO_PUBLIC_THEME;
  return isThemeName(env) ? env : DEFAULT_SKIN;
}

/** Display faces a skin may name in `fontFamily.display`. */
const DISPLAY_FONTS = { Fredoka_600SemiBold };

type Props = {
  /** Active preset. Unset = the flag above; the selected pet's skin arrives in 11.10. */
  name?: ThemeName;
  children: ReactNode;
};

export function ThemeProvider({ name, children }: Props) {
  const [flagged] = useState(flaggedSkin);
  const active = name ?? flagged;
  const [fontsLoaded] = useFonts(DISPLAY_FONTS);
  const theme = useMemo(() => {
    const built = buildTheme(active);
    // Until the display face loads (or if it never does), titles use the platform font.
    return fontsLoaded ? built : { ...built, fontFamily: { ...built.fontFamily, display: undefined } };
  }, [active, fontsLoaded]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Design values for screens and `components/ui` — use this instead of importing `tokens`. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Styles built from the active theme, rebuilt only when the theme changes.
 * Pass a module-level factory that returns `StyleSheet.create({...})`.
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
