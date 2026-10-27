import { Pressable, StyleSheet } from "react-native";

import { Icon } from "./Icon";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  onPress: () => void;
  testID?: string;
};

/** The ← arrow, top left, 44 px, read aloud as Back: the one Back control everywhere (U1, DESIGN.md §7.8). */
export function BackLink({ onPress, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      hitSlop={theme.spacing.sm}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      testID={testID}
    >
      <Icon name="arrowBack" size={theme.icon.md} color={theme.color.text} />
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    back: {
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-start",
      width: 44,
      height: 44,
      // The arrow's drawn edge, not its button, lines up with the screen's text: half the room around the icon plus
      // Lucide's own inset (the stroke starts 4 of 24 units in).
      marginLeft: -((44 - theme.icon.md) / 2 + (theme.icon.md * 4) / 24),
    },
    pressed: { opacity: theme.opacity.pressed },
  });
