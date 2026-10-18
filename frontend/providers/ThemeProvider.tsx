import { Fredoka_600SemiBold } from "@expo-google-fonts/fredoka/600SemiBold";
import { useFonts } from "expo-font";
import { ReactNode, createContext, useContext, useMemo, useState } from "react";
import { Platform } from "react-native";

import { Theme, ThemeName, buildTheme, isThemeName } from "../theme/themes";

const ThemeContext = createContext<Theme>(buildTheme("default"));

const SKIN_KEY = "goldito.skin";

/**
 * Skin preview flag, off by default: `?skin=expressive` on web (kept for the tab session,
 * `?skin=default` clears it), else EXPO_PUBLIC_THEME, else `default`.
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
  return isThemeName(env) ? env : "default";
}

/** Loads the skin's display face. Titles show the platform font until it arrives. */
function DisplayFont() {
  useFonts({ Fredoka_600SemiBold });
  return null;
}

type Props = {
  /** Active preset. Unset = the flag above; the selected pet's skin arrives in 11.10. */
  name?: ThemeName;
  children: ReactNode;
};

export function ThemeProvider({ name, children }: Props) {
  const [flagged] = useState(flaggedSkin);
  const active = name ?? flagged;
  const theme = useMemo(() => buildTheme(active), [active]);
  return (
    <ThemeContext.Provider value={theme}>
      {theme.fontFamily.display ? <DisplayFont /> : null}
      {children}
    </ThemeContext.Provider>
  );
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
