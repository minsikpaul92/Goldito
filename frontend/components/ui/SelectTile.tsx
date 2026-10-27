import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { selectable } from "./selectable";
import { Tag } from "./Tag";

type Props = {
  /** A picture above the label (a pet sprite, an icon); beside it when `wide`. */
  art: ReactNode;
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** A short read-only note on the tile ("Max's breed"), as a brand Tag (under the name on a wide tile, under the rest otherwise). */
  tag?: string;
  /** Two columns wide, the picture beside the text (the one tile that should stand out). */
  wide?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/**
 * A picture plus a name you pick from a grid (breeds on the Look screen). Same picked look as every chip and card
 * (`selectable`); the name wraps to 3 lines at one type size instead of shrinking or cutting off. The picture sits at the
 * top and the name area is always 2 lines high, so names line up across a grid.
 */
export function SelectTile({ art, label, selected, onPress, tag, wide, style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const tagView = tag ? <Tag label={tag} tone="brand" style={wide ? styles.wideTag : styles.tag} testID={testID ? `${testID}-tag` : undefined} /> : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tag ? `${label}, ${tag}` : label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, wide && styles.wide, selected && styles.on, pressed && styles.pressed, style]}
      testID={testID}
    >
      {wide ? (
        // Picture | name with the tag under it, in one text column.
        <View style={[styles.body, styles.wideBody]}>
          {art}
          <View style={styles.wideText}>
            <Text style={[styles.label, styles.wideLabel]} numberOfLines={3}>{label}</Text>
            {tagView}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.body}>
            {art}
            <Text style={[styles.label, styles.twoLines]} numberOfLines={3}>{label}</Text>
          </View>
          {tagView}
        </>
      )}
    </Pressable>
  );
}

const makeStyles = (theme: Theme) => {
  const { card, cardOn } = selectable(theme);
  return StyleSheet.create({
    tile: {
      minHeight: theme.layout.touchTarget,
      alignItems: "center",
      gap: theme.spacing.xs,
      padding: theme.spacing.xs,
      borderRadius: theme.radius.md,
      borderWidth: card.borderWidth,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    wide: { justifyContent: "center", paddingHorizontal: theme.spacing.sm },
    on: { borderWidth: cardOn.borderWidth, borderColor: cardOn.borderColor, backgroundColor: cardOn.backgroundColor },
    pressed: { opacity: theme.motion.pressOpacity },
    body: { alignSelf: "stretch", alignItems: "center", gap: theme.spacing.xs },
    wideBody: { flexDirection: "row", gap: theme.spacing.sm },
    tag: { alignSelf: "center" },
    label: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text, textAlign: "center" },
    twoLines: { alignSelf: "stretch", minHeight: theme.lineHeight.small * 2 },
    wideText: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: theme.spacing.xs },
    wideTag: { alignSelf: "flex-start" },
    wideLabel: { alignSelf: "stretch", textAlign: "left" },
  });
};
