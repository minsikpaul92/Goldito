import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FeedTagIcon } from "./FeedTagIcon";
import { HOME_TEXT } from "./home/homeType";
import { Button } from "./ui/Button";
import { DayPickerSheet } from "./ui/DayPickerSheet";
import { Sheet } from "./ui/Sheet";
import { TextField } from "./ui/TextField";
import { TimePickerSheet } from "./ui/TimePickerSheet";
import { addDays, appToday, formatDay, formatTime, isoToZoned, zonedToIso } from "../features/schedule/dates";
import { FEED_TAGS, FeedEdit, FeedTag, FeedTimelinePost } from "../lib/feed";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { FEED_NOTE_MAX } from "./AddPhotoSheet";

type Props = {
  /** The photo being edited; the sheet is open while there is one. */
  post: FeedTimelinePost | null;
  saving: boolean;
  onClose: () => void;
  onSave: (edit: FeedEdit) => void;
};

/**
 * Edit a photo you posted (#345): its tags (any number: a walk and a potty at once), the day and time it is from, and
 * the memo. The time it was sent does not change.
 */
export function FeedEditSheet({ post, saving, onClose, onSave }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [tags, setTags] = useState<FeedTag[]>([]);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("00:00");
  const [note, setNote] = useState("");
  const [picker, setPicker] = useState<"day" | "time" | null>(null);

  useEffect(() => {
    if (!post) return;
    const at = isoToZoned(post.takenAt);
    setTags(post.tags);
    setDay(at.day);
    setTime(at.time);
    setNote(post.note ?? "");
    setPicker(null);
  }, [post]);

  const toggle = (tag: FeedTag) => setTags((list) => (list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]));

  return (
    <>
      <Sheet
        visible={post != null}
        title="Edit photo"
        onClose={() => {
          if (!saving) onClose();
        }}
        testID="feed-edit-sheet"
        footer={
          <Button
            label="Save"
            loading={saving}
            onPress={() => onSave({ takenAt: zonedToIso(day, time), note: note.trim(), tags })}
            testID="feed-edit-save"
          />
        }
      >
        <View style={styles.body}>
          <Text style={styles.label}>Tags</Text>
          <View style={styles.tags}>
            {FEED_TAGS.map((tag) => {
              const on = tags.includes(tag.key);
              return (
                <Pressable
                  key={tag.key}
                  accessibilityRole="checkbox"
                  aria-checked={on}
                  onPress={() => toggle(tag.key)}
                  style={[styles.chip, on && styles.chipOn]}
                  testID={`feed-edit-tag-${tag.key}`}
                >
                  <FeedTagIcon tag={tag.key} size={24} color={on ? theme.color.primaryText : theme.color.text} />
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{tag.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.when}>
            <Pressable accessibilityRole="button" onPress={() => setPicker("day")} style={styles.field} testID="feed-edit-date">
              <Text style={styles.fieldLabel}>Date</Text>
              <Text style={styles.fieldValue}>{day ? `${formatDay(day)}, ${day.slice(0, 4)}` : ""}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setPicker("time")} style={styles.field} testID="feed-edit-time">
              <Text style={styles.fieldLabel}>Time</Text>
              <Text style={styles.fieldValue}>{formatTime(time)}</Text>
            </Pressable>
          </View>

          <TextField
            label="Note"
            value={note}
            onChangeText={setNote}
            maxLength={FEED_NOTE_MAX}
            multiline
            testID="feed-edit-note"
          />
        </View>
      </Sheet>

      <DayPickerSheet
        visible={picker === "day"}
        title="Date"
        value={day || appToday()}
        minDay={addDays(appToday(), -730)}
        maxDay={appToday()}
        onPick={(d) => {
          setDay(d);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        testID="feed-edit-day"
      />
      <TimePickerSheet
        visible={picker === "time"}
        value={time}
        title="Time"
        onClose={() => setPicker(null)}
        onPick={(t) => {
          setTime(t);
          setPicker(null);
        }}
        testID="feed-edit-time-picker"
      />
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: theme.spacing.md },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 6,
      paddingRight: 12,
      paddingVertical: 4,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    chipOn: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
    chipText: { fontSize: HOME_TEXT.chip, lineHeight: 18.2, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    chipTextOn: { color: theme.color.primaryText },
    when: { flexDirection: "row", gap: theme.spacing.sm },
    field: {
      flex: 1,
      minHeight: theme.layout.touchTarget,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
      gap: 2,
    },
    fieldLabel: { fontSize: theme.fontSize.caption, color: theme.color.textMuted },
    fieldValue: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
