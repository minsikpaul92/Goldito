import { Pressable, StyleSheet, Text, View } from "react-native";

import { FeedTagIcon } from "./FeedTagIcon";
import { HOME_TEXT } from "./home/homeType";
import { HorizontalList } from "./ui/HorizontalList";
import { Icon } from "./ui/Icon";
import { FEED_FILTERS, FeedFilterKey } from "../lib/feed";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** What the chips choose: a tag filter, or `hidden` (the photos I hid). */
export type FeedChipKey = FeedFilterKey | "hidden";

type Props = {
  value: FeedChipKey;
  onChange: (key: FeedChipKey) => void;
  /** How many photos I hid: the Hidden chip comes after No tag only when there are some. */
  hiddenCount: number;
};

/** The Feed's filter chips (Figma 1730:104035): All · Meals · Walks · Naps · Mood · Potty · No tag (· Hidden), a row that scrolls sideways. */
export function FeedFilterChips({ value, onChange, hiddenCount }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <HorizontalList contentStyle={styles.row} testID="feed-filters">
      {FEED_FILTERS.map((filter) => {
        const on = filter.key === value;
        return (
          <Pressable
            key={filter.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(filter.key)}
            style={[styles.chip, on && styles.chipOn]}
            testID={`feed-filter-${filter.key}`}
          >
            <FeedTagIcon tag={filter.key} size={28} color={on ? theme.color.primaryText : theme.color.text} />
            <Text style={[styles.label, on && styles.labelOn]}>{filter.label}</Text>
          </Pressable>
        );
      })}
      {hiddenCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: value === "hidden" }}
          onPress={() => onChange("hidden")}
          style={[styles.chip, value === "hidden" && styles.chipOn]}
          testID="feed-filter-hidden"
        >
          <View style={styles.hiddenIcon}>
            <Icon name="hidden" size={18} color={value === "hidden" ? theme.color.primaryText : theme.color.text} />
          </View>
          <Text style={[styles.label, value === "hidden" && styles.labelOn]}>Hidden</Text>
        </Pressable>
      ) : null}
    </HorizontalList>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { gap: 8, paddingTop: 0 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 6,
      paddingRight: 12,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    chipOn: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
    hiddenIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
    label: { fontSize: HOME_TEXT.chip, lineHeight: 18.2, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    labelOn: { color: theme.color.primaryText },
  });
