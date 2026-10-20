import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";
import { AddressSuggestion, suggestAddresses } from "../lib/transit";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** The address text that was found on the map; the input is "verified" while it still reads exactly this. */
  placed: string | null;
  /** The person picked one of the real addresses (its text and point). */
  onPick: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  error?: string | null;
  /** Prefix of the test ids: `${testID}-check-address`, `-address-ok`, `-suggestions`, `-suggestion-1`, `-check-note`. */
  testID: string;
};

/**
 * Every address a person types is checked against real places: Check address (one lookup per press, never per
 * keystroke) lists up to five, the one picked is the address. Unchecked or edited text is not verified.
 */
export function AddressInput({ label, value, onChangeText, placed, onPick, placeholder, error, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Any change of the text (typed, picked, filled from the location) clears the old answer.
  useEffect(() => {
    setSuggestions(null);
    setNote(null);
  }, [value]);

  const text = value.trim();
  const verified = text !== "" && text === placed;

  const check = async () => {
    if (text.length < 3 || checking) return;
    setChecking(true);
    setNote(null);
    setSuggestions(null);
    const found = await suggestAddresses(text);
    setChecking(false);
    if (found === null) setNote("The address check is down. Try again in a moment.");
    else if (found.length === 0) setNote("We couldn't find that address. Check the spelling or add the postal code.");
    else setSuggestions(found);
  };

  return (
    <View style={styles.root}>
      <TextField label={label} value={value} onChangeText={onChangeText} placeholder={placeholder} error={error} testID={testID} />
      <View style={styles.row}>
        {verified ? (
          <Text style={styles.found} testID={`${testID}-address-ok`}>
            ✓ Found on the map
          </Text>
        ) : (
          <TextButton
            label={checking ? "Checking…" : "Check address"}
            onPress={() => void check()}
            disabled={checking || text.length < 3}
            style={styles.left}
            testID={`${testID}-check-address`}
          />
        )}
      </View>
      {suggestions && suggestions.length > 0 ? (
        <View style={styles.suggestions} testID={`${testID}-suggestions`}>
          {suggestions.map((s, i) => (
            <TextButton key={s.label} label={s.label} onPress={() => onPick(s)} style={styles.suggestion} testID={`${testID}-suggestion-${i + 1}`} />
          ))}
        </View>
      ) : null}
      {note ? (
        <Text style={styles.note} testID={`${testID}-check-note`}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.xs },
    row: { alignItems: "flex-start" },
    left: { alignSelf: "flex-start", paddingHorizontal: 0 },
    found: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.success },
    suggestions: { gap: theme.spacing.xs },
    suggestion: { alignSelf: "flex-start", paddingHorizontal: 0, minHeight: 36 },
    note: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
