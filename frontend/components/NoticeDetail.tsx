import { Image, StyleSheet, Text, View } from "react-native";

import { formatFeedTime } from "../lib/feed";
import { deliveryUrl, thumbUrl, videoPosterUrl } from "../lib/cloudinary";
import type { AppNotification } from "../lib/notifications";
import type { DiaryMedia } from "../features/diary/diaryApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";

type Props = {
  notice: AppNotification | null;
  media: DiaryMedia | null;
  /** Label of the button that carries on to the screen the notice points at. */
  next: string;
  /** Closing (✕, backdrop or the button) — the caller then goes on to that screen. */
  onClose: () => void;
};

/** Small photo on a notice card/row, so you can tell a photo came before opening it. */
export function NoticeThumb({ media }: { media: DiaryMedia }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Image
      accessibilityLabel="Photo attached"
      source={{ uri: media.resourceType === "video" ? videoPosterUrl(media.publicId, 120) : thumbUrl(media.publicId, 120) }}
      style={styles.thumb}
      testID="notice-thumb"
    />
  );
}

/** A notice that carries a photo and/or a memo opens big first; closing it goes on to History/Feed. */
export function NoticeDetail({ notice, media, next, onClose }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Sheet
      visible={notice != null}
      title="Update"
      onClose={onClose}
      testID="notice-detail"
      footer={<Button label={next} onPress={onClose} testID="notice-detail-next" />}
    >
      {notice ? (
        <View style={styles.body}>
          {media ? (
            <Image
              accessibilityLabel="Photo from your sitter"
              source={{ uri: media.resourceType === "video" ? videoPosterUrl(media.publicId, 900) : deliveryUrl(media.publicId, 900) }}
              resizeMode="contain"
              style={styles.photo}
              testID="notice-detail-photo"
            />
          ) : null}
          <Text style={styles.title} testID="notice-detail-title">
            {notice.title}
          </Text>
          {notice.body ? (
            <Text style={styles.memo} testID="notice-detail-memo">
              {notice.body}
            </Text>
          ) : null}
          <Text style={styles.time}>{formatFeedTime(notice.createdAt)}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    thumb: { width: 48, height: 48, borderRadius: theme.radius.sm, backgroundColor: theme.color.accent },
    body: { gap: theme.spacing.sm },
    photo: { width: "100%", height: 300, borderRadius: theme.radius.md, backgroundColor: theme.color.accent },
    title: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    memo: { fontSize: theme.fontSize.body, color: theme.color.text },
    time: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
