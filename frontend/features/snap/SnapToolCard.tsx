import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../../components/ui/Icon";
import { Avatar } from "../../components/ui/Avatar";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  emoji: string;
  title: string;
  blurb: string;
  onPress: () => void;
  testID: string;
};

/** One Snap tool on the Snap tab: emoji, name, one line on what it does (same shape as PetCard). */
export function SnapToolCard({ emoji, title, blurb, onPress, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${blurb}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={testID}
    >
      <Avatar kind="emoji" emoji={emoji} size={56} />
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.blurb}>{blurb}</Text>
      </View>
      <Icon name="forward" size={theme.icon.sm} color={theme.color.textMuted} />
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    pressed: { opacity: 0.8 },
    body: { flex: 1, gap: theme.spacing.xs },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    blurb: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
