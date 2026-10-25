import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../../components/ui/EmptyState";
import { Avatar } from "../../../components/ui/Avatar";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { SummaryRow } from "../../../components/ui/SummaryRow";
import { ChatContact, loadChatContact } from "../../../features/contact/contactApi";
import { ProfilePhoto, loadProfilePhotos, photoThumb } from "../../../features/profile/profilePhotosApi";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

/**
 * The owner as the sitter sees them from a chat: name, photo, the area of the home (first three characters of the
 * postal code) and the phone once it may be shared. The street address and the entry info stay behind payment (D31).
 */
export default function OwnerForSitterScreen() {
  const { ownerId, thread } = useLocalSearchParams<{ ownerId: string; thread: string }>();
  const styles = useThemedStyles(makeStyles);
  const [contact, setContact] = useState<ChatContact | null | undefined>(undefined);
  const [cover, setCover] = useState<ProfilePhoto | null>(null);

  useEffect(() => {
    let live = true;
    void loadChatContact(thread).then((c) => live && setContact(c));
    void loadProfilePhotos(ownerId)
      .then((photos) => live && setCover(photos[0] ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [ownerId, thread]);

  if (contact === undefined) return <LoadingView />;
  if (!contact || contact.otherId !== ownerId) {
    return (
      <Screen>
        <EmptyState emoji="👤" title="Owner not available" message="Open this from your chat." />
      </Screen>
    );
  }
  return (
    <Screen contentStyle={styles.content} testID="owner-view">
      <View style={styles.head}>
        {cover ? <Avatar kind="photo" uri={photoThumb(cover, 240)} size={80} testID="owner-view-photo" /> : <Avatar kind="initial" name={contact.name} size={80} />}
        <Text style={styles.name} accessibilityRole="header" testID="owner-view-name">
          {contact.name}
        </Text>
      </View>
      <View>
        <SummaryRow label="Area" value={contact.area ?? "Not set"} testID="owner-view-area" />
        <SummaryRow label="Phone" value={contact.phone ?? "After the Meet & Greet is set"} testID="owner-view-phone" />
      </View>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.lg },
    head: { alignItems: "center", gap: theme.spacing.sm, paddingTop: theme.spacing.md },
    name: { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.color.text },
  });
