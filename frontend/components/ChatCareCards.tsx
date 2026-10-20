import { router } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { CareItem, inCare, useCareItems } from "../features/chat/careCards";
import { formatDay, isoToZoned } from "../features/schedule/dates";
import type { BookingSummary } from "../lib/bookings";
import { thumbUrl, videoPosterUrl } from "../lib/cloudinary";
import { requestPhoto } from "../lib/photoRequests";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

type Props = { booking: BookingSummary; viewer: "owner" | "sitter" };

/**
 * The stay's care news, in the chat (3D.8): a photo asked for and its answer with a one-line caption, and the day's
 * diary page. Cards read the database like the Feed and Diary do and link to them; nothing is stored in the chat.
 */
export function ChatCareCards({ booking, viewer }: Props) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const { items, reload } = useCareItems(booking);
  const [asking, setAsking] = useState(false);
  const owner = viewer === "owner";
  const other = owner ? booking.sitterName : booking.ownerName;

  const askable = booking.pets.flatMap((p) => (p.id && !items?.some((i) => i.kind === "photo" && i.status === "open" && i.petId === p.id) ? [p.id] : []));
  const ask = async () => {
    setAsking(true);
    try {
      for (const id of askable) await requestPhoto(id);
      reload();
    } catch (e) {
      errorDialog.show({ title: "Not sent", message: (e as Error).message });
    } finally {
      setAsking(false);
    }
  };

  const photo = (i: Extract<CareItem, { kind: "photo" }>) => {
    if (i.status === "open") {
      return (
        <Card style={styles.card} testID="chat-photo-open">
          <Text style={styles.title}>{owner ? `You asked for a photo of ${i.petName}` : `${other} asked for a photo of ${i.petName} 📷`}</Text>
          {owner ? (
            <Text style={styles.muted}>{`Waiting for ${other}`}</Text>
          ) : (
            <Button label="Send photo" onPress={() => router.push(`/sitter/feed/${i.petId}` as never)} testID="chat-photo-send" />
          )}
        </Card>
      );
    }
    const url = i.media ? (i.media.resourceType === "video" ? videoPosterUrl(i.media.publicId, 600) : thumbUrl(i.media.publicId, 600)) : "";
    return (
      <Card style={styles.card} testID="chat-photo-done">
        <Text style={styles.title}>{owner ? `${other} sent a photo of ${i.petName}` : `You sent a photo of ${i.petName}`}</Text>
        {url ? <Image source={{ uri: url }} style={styles.photo} accessibilityLabel={`Photo of ${i.petName}`} /> : null}
        {i.caption ? (
          <Text style={styles.caption} numberOfLines={1} testID="chat-photo-caption">
            {i.caption}
          </Text>
        ) : null}
      </Card>
    );
  };

  const diary = (i: Extract<CareItem, { kind: "diary" }>) => (
    <Card style={styles.card} testID="chat-diary-card">
      <Text style={styles.title}>{owner ? "Diary written 📖" : "You wrote the diary 📖"}</Text>
      <Text style={styles.muted}>{`${i.petName} · ${formatDay(isoToZoned(i.at).day)}`}</Text>
      <Button
        label="Open diary"
        onPress={() => router.push((owner ? `/owner/diary/${i.reportId}` : "/sitter/diary") as never)}
        testID="chat-diary-open"
      />
    </Card>
  );

  const care = inCare(booking);
  if (!items?.length && !(owner && care)) return null;
  return (
    <View style={styles.wrap}>
      {(items ?? []).map((i) => (
        <View key={`${i.kind}-${i.id}`} style={styles.row}>
          {i.kind === "photo" ? photo(i) : diary(i)}
        </View>
      ))}
      {owner && care && askable.length > 0 ? (
        <Button label="Ask for a photo" variant="secondary" onPress={() => void ask()} disabled={asking} testID="chat-ask-photo" />
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { width: "100%", alignItems: "center", gap: theme.spacing.sm },
    row: { width: "100%", alignItems: "center" },
    card: { gap: theme.spacing.sm, maxWidth: "92%", width: "92%" },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    caption: { fontSize: theme.fontSize.small, color: theme.color.text },
    photo: { width: "100%", aspectRatio: 1, borderRadius: theme.ui.radius.card, backgroundColor: theme.color.border },
  });
