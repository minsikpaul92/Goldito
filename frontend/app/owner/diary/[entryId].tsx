import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { ReportPhoto, SentReport, getSentReport, listReportPhotos } from "../../../features/diary/reportApi";
import { formatDay } from "../../../features/schedule/dates";
import { thumbUrl, videoPosterUrl } from "../../../lib/cloudinary";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

/** One daily report, read-only (phase-07 7.3): date, the sitter's text, that day's photos, and the tasks. */
export default function OwnerDiaryEntry() {
  const styles = useThemedStyles(makeStyles);
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const [report, setReport] = useState<SentReport | null | undefined>(undefined);
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await getSentReport(entryId);
        if (cancelled) return;
        setReport(found);
        if (found) setPhotos(await listReportPhotos(found.petId, found.day));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (error) {
    return (
      <Screen>
        <EmptyState emoji="📔" title="Couldn't load this entry" message={error} />
      </Screen>
    );
  }
  if (report === undefined) return <LoadingView />;
  if (!report) {
    return (
      <Screen>
        <EmptyState emoji="📔" title="Entry not found" message="This diary entry isn't available." />
      </Screen>
    );
  }
  return (
    <Screen testID="owner-diary-entry" contentStyle={{ gap: 12 }}>
      <Stack.Screen options={{ title: `${report.petName} · ${formatDay(report.day)}` }} />
      <Card style={styles.card}>
        <Text style={styles.meta}>{`From ${report.sitterName}`}</Text>
        <Text style={styles.body} testID="diary-entry-body">{report.body}</Text>
      </Card>
      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} testID="diary-entry-photos">
          {photos.map((p) => (
            <Image
              key={p.id}
              source={{ uri: p.resourceType === "video" ? videoPosterUrl(p.publicId, 400) : thumbUrl(p.publicId, 400) }}
              style={styles.photo}
              accessibilityIgnoresInvertColors
            />
          ))}
        </ScrollView>
      ) : null}
      {report.tasks.length > 0 ? (
        <Card style={styles.card}>
          <Text style={styles.heading}>Today's tasks</Text>
          {report.tasks.map((t, i) => (
            <View key={`${i}-${t.title}`} style={styles.task}>
              <Text style={styles.body}>{`${t.status === "done" ? "✓" : "⚠️"} ${t.title}${t.status === "done" ? "" : " · missed"}`}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.xs },
    meta: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    heading: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    task: { paddingVertical: 2 },
    strip: { gap: theme.spacing.sm },
    photo: { width: 140, height: 140, borderRadius: theme.radius.md, backgroundColor: theme.color.border },
  });
