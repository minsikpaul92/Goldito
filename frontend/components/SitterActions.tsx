import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { InquirySheet } from "./InquirySheet";
import { dayTitle } from "./SlotRows";
import { Button } from "./ui/Button";
import { addDays, zonedToIso } from "../features/schedule/dates";
import { SitterProfileView } from "../features/sitters/sitterApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  sitter: SitterProfileView;
  /** A day page: Book starts the form on this day (drop-off at `dropTime`, pick-up the next day). */
  day?: string;
  dropTime?: string;
};

/** Ask before booking · Book, pinned under a sitter's profile, month and day pages. */
export function SitterActions({ sitter, day, dropTime = "09:00" }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [asking, setAsking] = useState(false);
  const book = () => {
    const stay = day ? `&drop=${encodeURIComponent(zonedToIso(day, dropTime))}&pick=${encodeURIComponent(zonedToIso(addDays(day, 1), "17:00"))}` : "";
    router.push(`/owner/bookings/new?sitter=${sitter.id}${stay}`);
  };
  return (
    <>
      <View style={styles.footer}>
        {/* FB-33: asking first reads as "before booking", next to Book. Book stays the one filled button. */}
        <View style={styles.actions}>
          <Button label="Ask before booking" variant="secondary" onPress={() => setAsking(true)} style={styles.action} testID="ask-about-stay" />
          <Button label="Book" onPress={book} style={styles.action} testID="book-this-sitter" />
        </View>
        <Text style={styles.hint}>
          {day ? `${dayTitle(day)} is filled in when you book.` : "Nothing is booked until you send a request."}
        </Text>
      </View>
      <InquirySheet visible={asking} onClose={() => setAsking(false)} sitter={sitter} />
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    footer: { padding: theme.spacing.md, maxWidth: 480, width: "100%", alignSelf: "center" },
    actions: { flexDirection: "row", gap: theme.spacing.sm },
    action: { flex: 1 },
    hint: { marginTop: theme.spacing.xs, fontSize: theme.fontSize.small, color: theme.color.textMuted, textAlign: "center" },
  });
