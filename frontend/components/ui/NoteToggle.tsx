import { Pressable, StyleSheet } from "react-native";

import { Icon } from "./Icon";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  open: boolean;
  /** A note is written, so a closed toggle still shows it is there. */
  filled: boolean;
  onPress: () => void;
  testID?: string;
};

/** A round "+" that opens a note, and "-" (an icon) that folds it again. */
export function NoteToggle({ open, filled, onPress, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={open ? "Hide note" : "Add a note"}
      aria-expanded={open}
      onPress={onPress}
      testID={testID}
      style={[styles.button, filled && !open && styles.filled]}
    >
      <Icon name={open ? "remove" : "add"} size={22} color={theme.color.primary} />
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    button: {
      width: theme.layout.touchTarget,
      height: theme.layout.touchTarget,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    filled: { borderColor: theme.color.primary, backgroundColor: theme.color.accent },
  });
