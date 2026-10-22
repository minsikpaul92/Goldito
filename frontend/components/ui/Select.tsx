import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { Icon } from "./Icon";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { CheckRow } from "./CheckRow";
import { Sheet } from "./Sheet";

type Option = { value: string; label: string };

type Props = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  /** Spoken name and the sheet's title, e.g. "Whose demo". */
  label: string;
  testID?: string;
};

/** A dropdown: the chosen option on a row, a sheet with the options when tapped. */
export function Select({ value, options, onChange, label, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value) ?? options[0];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen.label}`}
        aria-haspopup="listbox"
        onPress={() => setOpen(true)}
        style={styles.row}
        testID={testID}
      >
        <Text style={styles.value}>{chosen.label}</Text>
        <Icon name="expand" size={theme.icon.sm} color={theme.color.textMuted} />
      </Pressable>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)} testID={testID ? `${testID}-sheet` : undefined}>
        {options.map((option) => (
          <CheckRow
            key={option.value}
            radio
            label={option.label}
            checked={option.value === value}
            onChange={() => {
              onChange(option.value);
              setOpen(false);
            }}
            testID={testID ? `${testID}-${option.value}` : undefined}
          />
        ))}
      </Sheet>
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      minHeight: theme.layout.touchTarget,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    value: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
