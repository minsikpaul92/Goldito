import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { selectable } from "./selectable";

type Props = {
  title: string;
  /** One line under the title: "Dog · Maltese · 4 years". */
  detail?: string;
  /** A photo, avatar or illustration on the left. */
  leading?: ReactNode;
  selected: boolean;
  onPress: () => void;
  /** Checkbox semantics (pick several) instead of radio (pick one). */
  multi?: boolean;
  /** Can't be picked right now (e.g. no free days): faded, with the reason as the detail. */
  disabled?: boolean;
  testID?: string;
};

/**
 * A big tappable answer for one-question screens (design site: steps.html "Who is staying with Chloe?").
 * Same picker look as chips (selectable): white with a strong line, mint with an ink ring and a check when selected.
 */
export function OptionCard({ title, detail, leading, selected, onPress, multi, disabled, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      onPress={onPress}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      testID={testID}
      style={({ pressed }) => [styles.card, selected && styles.cardOn, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected ? <Icon name="check" size={20} color={theme.color.primaryText} /> : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: selectable(theme).card,
    cardOn: selectable(theme).cardOn,
    pressed: { opacity: theme.motion.pressOpacity, transform: [{ scale: theme.motion.pressScale }] },
    disabled: { opacity: theme.opacity.disabled, borderStyle: "dashed" },
    leading: { width: 52, height: 52, borderRadius: 14, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    body: { flex: 1, gap: 2 },
    title: { fontSize: theme.fontSize.option, lineHeight: theme.lineHeight.option, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    detail: { fontSize: theme.fontSize.body, color: theme.color.textMuted },
    check: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: theme.color.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    checkOn: { backgroundColor: theme.color.text, borderColor: theme.color.text },
  });
