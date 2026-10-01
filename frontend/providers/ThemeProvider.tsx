import { ReactNode, createContext, useContext, useMemo } from "react";

import { Theme, ThemeName, buildTheme } from "../theme/themes";

const ThemeContext = createContext<Theme>(buildTheme("default"));

type Props = {
  /** Active preset. Only `default` for now; the selected pet's skin arrives in 11.10. */
  name?: ThemeName;
  children: ReactNode;
};

export function ThemeProvider({ name = "default", children }: Props) {
  const theme = useMemo(() => buildTheme(name), [name]);
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
