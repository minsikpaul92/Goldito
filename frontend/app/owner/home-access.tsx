import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { TextField } from "../../components/ui/TextField";
import { saveOwnerHomeAccess } from "../../lib/bookings";
import { getSupabase } from "../../lib/supabase";
import { homeFor, useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";

type Draft = {
  entrySteps: string;
  lockboxCode: string;
  buzzer: string;
  fobNotes: string;
  sitterParking: string;
};

/**
 * Owner entry codes form (03C). Shown to the booked sitter only from 2 h before arrival.
 */
export default function HomeAccessScreen() {
  const styles = useThemedStyles(makeStyles);
  const session = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session.profile || session.profile.role !== "owner") return;
    void (async () => {
      const { data, error } = await getSupabase()
        .from("owner_home_access")
        .select("entry_steps, lockbox_code, buzzer, fob_notes, sitter_parking")
        .eq("owner_id", session.profile!.id)
        .maybeSingle();
      if (error) {
        setLoadError(error.message);
        return;
      }
      setDraft({
        entrySteps: (data?.entry_steps as string | null) ?? "",
        lockboxCode: (data?.lockbox_code as string | null) ?? "",
        buzzer: (data?.buzzer as string | null) ?? "",
        fobNotes: (data?.fob_notes as string | null) ?? "",
        sitterParking: (data?.sitter_parking as string | null) ?? "",
      });
    })();
  }, [session.profile]);

  if (session.status === "loading") return <LoadingView />;
  if (!session.profile) return <Redirect href="/login" />;
  if (session.profile.role !== "owner") return <Redirect href={homeFor("sitter")} />;
  if (loadError) {
    return (
      <Screen>
        <EmptyState emoji="🔑" title="Couldn't load entry info" message={loadError} />
      </Screen>
    );
  }
  if (!draft) return <LoadingView />;

  const set = (key: keyof Draft, value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async () => {
    setSaving(true);
    try {
      await saveOwnerHomeAccess({
        entrySteps: draft.entrySteps.trim() || null,
        lockboxCode: draft.lockboxCode.trim() || null,
        buzzer: draft.buzzer.trim() || null,
        fobNotes: draft.fobNotes.trim() || null,
        sitterParking: draft.sitterParking.trim() || null,
      });
      toast.show("Entry info saved");
      router.back();
    } catch (err) {
      toast.show((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.content}>
        <Text style={styles.note} testID="home-access-note">
          Only shown to your booked sitter, starting 2 hours before they arrive. You'll be notified when
          it opens. Use obviously fake codes in this demo.
        </Text>
        <TextField
          label="Entry steps"
          value={draft.entrySteps}
          onChangeText={(v) => set("entrySteps", v)}
          multiline
          placeholder="1. Buzz 1204  2. Lockbox left of door"
          testID="home-access-entry_steps"
        />
        <TextField
          label="Lockbox code"
          value={draft.lockboxCode}
          onChangeText={(v) => set("lockboxCode", v)}
          placeholder="0000"
          testID="home-access-lockbox"
        />
        <TextField
          label="Buzzer"
          value={draft.buzzer}
          onChangeText={(v) => set("buzzer", v)}
          placeholder="#1204"
          testID="home-access-buzzer"
        />
        <TextField
          label="Fob notes"
          value={draft.fobNotes}
          onChangeText={(v) => set("fobNotes", v)}
          placeholder="Fob on the key hook"
          testID="home-access-fob"
        />
        <TextField
          label="Parking for sitter"
          value={draft.sitterParking}
          onChangeText={(v) => set("sitterParking", v)}
          placeholder="Visitor spot B-12"
          testID="home-access-parking"
        />
      </Screen>
      <View style={styles.footer}>
        <Button label="Save" onPress={() => void save()} disabled={saving} testID="home-access-save" />
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
    note: { fontSize: theme.fontSize.small, color: theme.color.textMuted, lineHeight: 20 },
    footer: {
      padding: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
  });
