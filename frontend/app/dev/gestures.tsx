import { Link, Redirect } from "expo-router";
import { useEffect, useState } from "react";
import {
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "../../components/ui/Button";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/**
 * Gesture lab (task 1.7): every touch pattern the app uses, for checking the
 * desktop phone frame with a mouse. Only available with EXPO_PUBLIC_DEV_ROUTES=1.
 */
const devRoutesEnabled = process.env.EXPO_PUBLIC_DEV_ROUTES === "1";

const CHIPS = ["Meal", "Water", "Potty", "Walk", "Nap", "Play", "Treat", "Litter", "Meds", "Bath", "Brush", "Cuddle"];
const PAGES: { label: string; tone: keyof Theme["color"] }[] = [
  { label: "Max at the park", tone: "primary" },
  { label: "Mochi napping", tone: "textMuted" },
  { label: "Max's dinner", tone: "success" },
  { label: "Mochi on the sofa", tone: "text" },
];
const ROWS = Array.from({ length: 30 }, (_, i) => `Row ${i + 1}`);

export default function GestureLab() {
  if (!devRoutesEnabled) return <Redirect href="/" />;
  return <GestureLabScreen />;
}

function GestureLabScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [taps, setTaps] = useState(0);
  const [lastTap, setLastTap] = useState("—");
  const [chip, setChip] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!toastVisible) return;
    const id = setTimeout(() => setToastVisible(false), 2000);
    return () => clearTimeout(id);
  }, [toastVisible]);

  function tap(label: string) {
    setTaps((n) => n + 1);
    setLastTap(label);
  }

  function onPagerLayout(e: LayoutChangeEvent) {
    setPageWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={styles.root}>
      <ScrollView testID="lab-scroll" contentContainerStyle={styles.content}>
        <Text style={styles.title}>Gesture lab</Text>
        <Text testID="lab-status" style={styles.muted}>
          Taps: <Text testID="tap-count">{taps}</Text> · Last: <Text testID="last-tap">{lastTap}</Text>
        </Text>
        <Link href="/" testID="lab-home" style={styles.link}>
          Go home
        </Link>

        <Text style={styles.section}>Chips (swipe sideways)</Text>
        <ScrollView
          horizontal
          testID="chip-row"
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroller}
        >
          {CHIPS.map((label) => (
            <Pressable
              key={label}
              testID={`chip-${label}`}
              accessibilityRole="button"
              onPress={() => {
                setChip(label);
                tap(label);
              }}
              style={[styles.chip, chip === label && styles.chipSelected]}
            >
              <Text style={[styles.chipText, chip === label && styles.chipTextSelected]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.section}>Photos (paged)</Text>
        <View onLayout={onPagerLayout}>
          <ScrollView horizontal pagingEnabled testID="pager" style={styles.pager}>
            {PAGES.map((page) => (
              <View
                key={page.label}
                style={[styles.page, { width: pageWidth, backgroundColor: theme.color[page.tone] }]}
              >
                <Text style={styles.pageText}>{page.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.actions}>
          <Button label="Open modal" onPress={() => setModalOpen(true)} />
          <Button label="Show toast" onPress={() => setToastVisible(true)} />
        </View>

        <TextInput
          testID="lab-input"
          value={note}
          onChangeText={setNote}
          placeholder="Type a note"
          placeholderTextColor={theme.color.textMuted}
          style={styles.input}
        />

        <Text style={styles.section}>Rows (tap or swipe)</Text>
        {ROWS.map((label) => (
          <Pressable
            key={label}
            testID={`row-${label.split(" ")[1]}`}
            accessibilityRole="button"
            onPress={() => tap(label)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Text style={styles.rowText}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {toastVisible ? (
        <View testID="lab-toast" style={styles.toast}>
          <Text style={styles.toastText}>Saved ✅</Text>
        </View>
      ) : null}

      <Modal transparent visible={modalOpen} onRequestClose={() => setModalOpen(false)}>
        <View style={styles.backdrop}>
          <View testID="lab-modal" style={styles.modal}>
            <Text style={styles.title}>Modal</Text>
            <Text style={styles.muted}>This should stay inside the phone.</Text>
            <Button label="Close" onPress={() => setModalOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    content: {
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    title: {
      fontSize: theme.fontSize.title,
      fontWeight: "700",
      color: theme.color.text,
    },
    muted: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    link: {
      fontSize: theme.fontSize.body,
      color: theme.color.primary,
      fontWeight: "600",
    },
    section: {
      marginTop: theme.spacing.md,
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.textMuted,
      textTransform: "uppercase",
    },
    chipScroller: {
      flexGrow: 0,
    },
    chipRow: {
      gap: theme.spacing.sm,
    },
    chip: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    chipSelected: {
      backgroundColor: theme.color.primary,
      borderColor: theme.color.primary,
    },
    chipText: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    chipTextSelected: {
      color: theme.color.primaryText,
    },
    pager: {
      borderRadius: theme.radius.lg,
    },
    page: {
      height: 160,
      alignItems: "center",
      justifyContent: "center",
    },
    pageText: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.primaryText,
    },
    actions: {
      marginTop: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    input: {
      marginTop: theme.spacing.sm,
      padding: theme.spacing.sm + 4,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    row: {
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    rowPressed: {
      opacity: 0.6,
    },
    rowText: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    toast: {
      position: "absolute",
      left: theme.spacing.md,
      right: theme.spacing.md,
      bottom: theme.spacing.lg,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.text,
    },
    toastText: {
      fontSize: theme.fontSize.body,
      color: theme.color.primaryText,
      textAlign: "center",
    },
    backdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.lg,
      backgroundColor: theme.color.overlay,
    },
    modal: {
      width: "100%",
      gap: theme.spacing.sm,
      padding: theme.spacing.lg,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.surface,
    },
  });
