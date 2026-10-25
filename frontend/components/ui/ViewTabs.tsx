import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
  /** The line under the tabs (default); a parent that draws one for a whole row turns it off. */
  rule?: boolean;
};

/**
 * Underline tabs that switch the view (Photos / Diary), as in Muk's feed trial (#345): the chosen tab is bold with a line
 * under it. Pills stay for filters.
 */
export function ViewTabs<T extends string>({ options, value, onChange, testID, rule = true }: Props<T>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View accessibilityRole="tablist" style={[styles.bar, !rule && styles.bare]} testID={testID}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            aria-selected={on}
            onPress={() => onChange(option.value)}
            style={[styles.tab, on && styles.tabOn]}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: { flexDirection: "row", gap: theme.spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.color.border },
    bare: { borderBottomWidth: 0 },
    tab: { minHeight: theme.layout.touchTarget, justifyContent: "center", borderBottomWidth: 3, borderBottomColor: "transparent", marginBottom: -1 },
    tabOn: { borderBottomColor: theme.color.primary },
    label: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    labelOn: { color: theme.color.text, fontWeight: theme.fontWeight.bold },
  });
