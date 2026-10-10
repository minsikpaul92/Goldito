import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { LifeRecord, listLifeRecords } from "../features/completion/completionApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { LifeRecordCard, recordSource } from "./LifeRecordCard";

/**
 * "From Max's Life Record" on a sitter's request card (phase-07C 7C.6): what the pet's earlier sitter learned, folded
 * so the card stays short. Shown only when there is a record the sitter may read (RLS: asked by a request or inquiry,
 * or the current sitter) — nothing at all otherwise.
 */
export function PetRecordFold({ petId, petName }: { petId: string; petName: string }) {
  const styles = useThemedStyles(makeStyles);
  const [record, setRecord] = useState<LifeRecord | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    listLifeRecords(petId)
      .then((records) => live && setRecord(records[0] ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [petId]);

  if (!record) return null;
  return (
    <View style={styles.root} testID={`record-fold-${petId}`}>
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        onPress={() => setOpen((v) => !v)}
        style={styles.header}
        testID={`record-fold-toggle-${petId}`}
      >
        <Text style={styles.title}>{`📖 From ${petName}'s Life Record`}</Text>
        <Text style={styles.hint}>{`${recordSource(record)} ${open ? "▴" : "▾"}`}</Text>
      </Pressable>
      {open ? <LifeRecordCard record={record} petName={petName} testID={`record-fold-card-${petId}`} /> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.xs },
    header: {
      gap: 2,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.accent,
    },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.primary },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
