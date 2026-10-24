import { Pressable, StyleSheet, Text } from "react-native";

import { FeedTagIcon } from "./FeedTagIcon";
import { HOME_TEXT } from "./home/homeType";
import { HorizontalList } from "./ui/HorizontalList";
import { FEED_FILTERS, FeedFilterKey } from "../lib/feed";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  value: FeedFilterKey;
  onChange: (key: FeedFilterKey) => void;
};

/** The Feed's filter chips (Figma 1730:104035): All · Meals · Walks · Naps · Mood · Potty · No tag, a row that scrolls sideways. */
export function FeedFilterChips({ value, onChange }: Props) {
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
    label: { fontSize: HOME_TEXT.chip, lineHeight: 18.2, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    labelOn: { color: theme.color.primaryText },
  });
