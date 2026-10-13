import { StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { TextButton } from "./ui/TextButton";

type Props = {
  visible: boolean;
  title: string;
  /** One short line each — who sees it, when it stops, what is kept. */
  lines: string[];
  allowLabel: string;
  onAllow: () => void;
  onDecline: () => void;
  /** The label of the way out; "Not now" suits a one-off ask, "Cancel" a choice that has other answers. */
  declineLabel?: string;
  /** A third answer: go ahead without sharing a position. */
  alternative?: { label: string; onPress: () => void };
  /** Demo accounts and the desktop frame: a drive that needs no GPS, through the same consent screen. */
  simulate?: { label: string; onPress: () => void };
  busy?: boolean;
  error?: string | null;
  testID?: string;
};

/**
 * The app's own consent screen, shown before the browser's permission prompt (D41). Nothing reads or sends a
 * location until **Allow** — closing the sheet or "Not now" is a no.
 */
export function ShareLocationSheet({
  visible,
  title,
  lines,
  allowLabel,
  onAllow,
  onDecline,
  declineLabel = "Not now",
  alternative,
  simulate,
  busy,
  error,
  testID = "share-location-sheet",
}: Props) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onDecline}
      testID={testID}
      footer={
        <View style={styles.actions}>
          <Button label={busy ? "Starting…" : allowLabel} onPress={onAllow} disabled={busy} testID={`${testID}-allow`} />
          {simulate ? (
            <Button label={simulate.label} variant="secondary" onPress={simulate.onPress} disabled={busy} testID={`${testID}-simulate`} />
          ) : null}
          {alternative ? (
            <Button label={alternative.label} variant="secondary" onPress={alternative.onPress} disabled={busy} testID={`${testID}-alternative`} />
          ) : null}
          <TextButton label={declineLabel} onPress={onDecline} disabled={busy} testID={`${testID}-decline`} />
        </View>
      }
    >
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    line: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
    actions: {
      gap: theme.spacing.sm,
    },
  });
