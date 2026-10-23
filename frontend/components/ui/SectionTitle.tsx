import { Text, TextStyle } from "react-native";

import { useTheme } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/**
 * One look for every section title (design site master; Figma Expressive: Fredoka 21 / 26, ink).
 * Skins without a display face fall back to the title size in bold. For "Recent checks", "Care tasks", "Account"…, not screen titles.
 */
export function sectionTitleStyle(theme: Theme): TextStyle {
  const display = theme.fontFamily.display;
  return display
    ? { fontFamily: display, fontSize: theme.fontSize.section, lineHeight: theme.lineHeight.section, color: theme.color.text }
    : { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.color.text };
}

export function SectionTitle({ children, testID }: { children: string; testID?: string }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={sectionTitleStyle(theme)} testID={testID}>
      {children}
    </Text>
  );
}
