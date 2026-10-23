import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { HOME_TEXT } from "../../components/home/homeType";
import { Icon } from "../../components/ui/Icon";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { tokens } from "../../theme/tokens";

type Props = {
  /** The drawing on the left (64 x 64). */
  art: ReactNode;
  /** The card's tint (a color block). */
  ground: string;
  title: string;
  blurb: string;
  onPress: () => void;
  testID: string;
};

/** One Snap tool on the Snap tab (Figma "tool.p / .m / .y"): a tinted card, a drawing, the name, one line, a round go button. */
export function SnapToolCard({ art, ground, title, blurb, onPress, testID }: Props) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${blurb}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: ground }, pressed && styles.pressed]}
      testID={testID}
    >
      <View style={styles.art}>{art}</View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.blurb}>{blurb}</Text>
      </View>
      <View style={styles.go}>
        <Icon name="forward" size={18} color={tokens.color.text} />
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: 14, paddingRight: 16, paddingVertical: 14, borderRadius: 28 },
    pressed: { opacity: 0.85 },
    art: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
    body: { flex: 1, gap: 3 },
    title: {
      ...(theme.fontFamily.display ? { fontFamily: theme.fontFamily.display } : { fontWeight: theme.fontWeight.bold }),
      fontSize: theme.fontSize.section,
      lineHeight: 23.1,
      color: theme.color.text,
    },
    blurb: { fontSize: HOME_TEXT.chip, lineHeight: 18.2, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    go: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface },
  });
