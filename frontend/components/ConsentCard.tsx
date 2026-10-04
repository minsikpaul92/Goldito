import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DEMO_CONSENT_FOOTER, type ConsentTemplate } from "../features/agreements/templates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Card } from "./ui/Card";
import { CheckRow } from "./ui/CheckRow";

type Props = {
  template: ConsentTemplate;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Already signed — show time, no checkbox. */
  signedAt?: string | null;
  disabled?: boolean;
  testID?: string;
};

/** One required consent: summary, full text, and a check (or read-only after sign). */
export function ConsentCard({ template, checked, onCheckedChange, signedAt, disabled, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const signed = Boolean(signedAt);

  return (
    <Card style={styles.card} testID={testID}>
      <Text accessibilityRole="header" style={styles.title}>
        {template.title}
      </Text>
      {template.summary.map((line) => (
        <Text key={line} style={styles.summary}>
          {`· ${line}`}
        </Text>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((v) => !v)}
        style={styles.linkWrap}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <Text style={styles.link}>{open ? "Hide full text" : "Read full text"}</Text>
      </Pressable>
      {open ? (
        <View style={styles.bodyBox}>
          <Text style={styles.body}>{template.body}</Text>
          <Text style={styles.footer}>{DEMO_CONSENT_FOOTER}</Text>
        </View>
      ) : null}
      {signed ? (
        <Text style={styles.signed} testID={testID ? `${testID}-signed` : undefined}>
          {`Signed ${new Date(signedAt!).toLocaleString()}`}
        </Text>
      ) : (
        <CheckRow
          label="I agree"
          checked={checked}
          onChange={onCheckedChange}
          disabled={disabled}
          testID={testID ? `${testID}-check` : undefined}
        />
      )}
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.xs },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    summary: { fontSize: theme.fontSize.small, color: theme.color.text, lineHeight: 20 },
    linkWrap: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
    link: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.primary },
    bodyBox: {
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
      backgroundColor: theme.color.background,
      borderRadius: theme.radius.md,
    },
    body: { fontSize: theme.fontSize.small, color: theme.color.text, lineHeight: 20 },
    footer: { fontSize: theme.fontSize.caption, color: theme.color.textMuted, fontStyle: "italic" },
    signed: { fontSize: theme.fontSize.small, color: theme.color.success, fontWeight: "600" },
  });
