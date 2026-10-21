import { StyleSheet, TextInput, TextInputProps } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** A 20 px text box for the large-text sign-up flow. The question above it is the label. */
export function BigInput(props: Omit<TextInputProps, "style">) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TextInput
      placeholderTextColor={`${theme.color.textMuted}80`}
      style={[styles.input, props.multiline && styles.multiline]}
      {...props}
    />
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    input: {
      minHeight: 64,
      fontSize: 20,
      color: theme.color.text,
      backgroundColor: theme.color.surface,
      borderRadius: theme.ui.radius.button,
      borderWidth: 2,
      borderColor: theme.color.borderStrong,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    multiline: { minHeight: 140, textAlignVertical: "top" },
  });
