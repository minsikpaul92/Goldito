import { StyleSheet, Text, View } from "react-native";

import type { LifeRecord } from "../features/completion/completionApi";
import { formatDay } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Card } from "./ui/Card";

type Props = {
  record: LifeRecord;
  petName: string;
  /** Latest = the full six squares. A smaller card lists only what is filled in. */
  testID?: string;
};

const ROWS: { key: "eats" | "meds" | "potty" | "behavior"; emoji: string; label: string }[] = [
  { key: "eats", emoji: "🍽️", label: "Eats" },
  { key: "meds", emoji: "💊", label: "Meds" },
  { key: "potty", emoji: "💩", label: "Potty" },
  { key: "behavior", emoji: "🐾", label: "Behavior" },
];

/** "From Chloe · Oct 9 – Oct 12" under a record: where the knowledge came from. */
export function recordSource(record: LifeRecord): string {
  const who = record.sitterName ? `From ${record.sitterName}` : "From the last stay";
  if (!record.stayFrom || !record.stayTo) return who;
  const from = formatDay(record.stayFrom);
  const to = formatDay(record.stayTo);
  return `${who} · ${from === to ? from : `${from} – ${to}`}`;
}

/**
 * A Pet Life Record: Eats · Meds · Potty · Behavior · Heads-up · Sitter tips — only what the stay actually showed.
 * Shared by the owner's pet record, the finished booking and (folded) a sitter's request card.
 */
export function LifeRecordCard({ record, petName, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const s = record.summary;
  const lists: { label: string; emoji: string; items: string[] }[] = [
    { emoji: "⚠️", label: "Heads-up", items: s.heads_up },
    { emoji: "💡", label: "Sitter tips", items: s.sitter_tips },
    { emoji: "🔄", label: "Changed since last time", items: s.changed_since_last },
  ];
  const filled = ROWS.some((r) => s[r.key]) || lists.some((l) => l.items.length > 0);

  return (
    <Card style={styles.card} testID={testID}>
      <Text accessibilityRole="header" style={styles.title}>{`${petName}'s Life Record`}</Text>
      <Text style={styles.source} testID={testID ? `${testID}-source` : undefined}>
        {recordSource(record)}
      </Text>
      {filled ? (
        <View style={styles.rows}>
          {ROWS.filter((r) => s[r.key]).map((r) => (
            <View key={r.key} style={styles.row} testID={testID ? `${testID}-${r.key}` : undefined}>
              <Text style={styles.label}>{`${r.emoji} ${r.label}`}</Text>
              <Text style={styles.body}>{s[r.key]}</Text>
            </View>
          ))}
          {lists
            .filter((l) => l.items.length > 0)
            .map((l) => (
              <View key={l.label} style={styles.row} testID={testID ? `${testID}-${l.label.split(" ")[0].toLowerCase()}` : undefined}>
                <Text style={styles.label}>{`${l.emoji} ${l.label}`}</Text>
                {l.items.map((item) => (
                  <Text key={item} style={styles.body}>{`• ${item}`}</Text>
                ))}
              </View>
            ))}
        </View>
      ) : (
        <Text style={styles.muted}>Nothing was recorded during that stay, so there is nothing to carry over yet.</Text>
      )}
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.sm },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    source: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    rows: { gap: theme.spacing.sm },
    row: { gap: 2 },
    label: { fontSize: theme.fontSize.small, fontWeight: "700", color: theme.color.textMuted },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
