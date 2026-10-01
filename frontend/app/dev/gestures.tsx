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
import { tokens } from "../../theme/tokens";

/**
 * Gesture lab (task 1.7): every touch pattern the app uses, for checking the
 * desktop phone frame with a mouse. Only available with EXPO_PUBLIC_DEV_ROUTES=1.
 */
const devRoutesEnabled = process.env.EXPO_PUBLIC_DEV_ROUTES === "1";

const CHIPS = ["Meal", "Water", "Potty", "Walk", "Nap", "Play", "Treat", "Litter", "Meds", "Bath", "Brush", "Cuddle"];
const PAGES = [
  { label: "Bori at the park", color: tokens.color.primary },
  { label: "Mochi napping", color: tokens.color.textMuted },
  { label: "Bori's dinner", color: tokens.color.success },
  { label: "Mochi on the sofa", color: tokens.color.text },
];
const ROWS = Array.from({ length: 30 }, (_, i) => `Row ${i + 1}`);

export default function GestureLab() {
  if (!devRoutesEnabled) return <Redirect href="/" />;
  return <GestureLabScreen />;
}

function GestureLabScreen() {
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
                style={[styles.page, { width: pageWidth, backgroundColor: page.color }]}
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
          placeholderTextColor={tokens.color.textMuted}
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  title: {
    fontSize: tokens.fontSize.title,
    fontWeight: "700",
    color: tokens.color.text,
  },
  muted: {
    fontSize: tokens.fontSize.small,
    color: tokens.color.textMuted,
  },
  link: {
    fontSize: tokens.fontSize.body,
    color: tokens.color.primary,
    fontWeight: "600",
  },
  section: {
    marginTop: tokens.spacing.md,
    fontSize: tokens.fontSize.small,
    fontWeight: "600",
    color: tokens.color.textMuted,
    textTransform: "uppercase",
  },
  chipScroller: {
    flexGrow: 0,
  },
  chipRow: {
    gap: tokens.spacing.sm,
  },
  chip: {
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  chipSelected: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  chipText: {
    fontSize: tokens.fontSize.small,
    color: tokens.color.text,
  },
  chipTextSelected: {
    color: tokens.color.primaryText,
  },
  pager: {
    borderRadius: tokens.radius.lg,
  },
  page: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  pageText: {
    fontSize: tokens.fontSize.body,
    fontWeight: "600",
    color: tokens.color.primaryText,
  },
  actions: {
    marginTop: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  input: {
    marginTop: tokens.spacing.sm,
    padding: tokens.spacing.sm + 4,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    fontSize: tokens.fontSize.body,
    color: tokens.color.text,
  },
  row: {
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowText: {
    fontSize: tokens.fontSize.body,
    color: tokens.color.text,
  },
  toast: {
    position: "absolute",
    left: tokens.spacing.md,
    right: tokens.spacing.md,
    bottom: tokens.spacing.lg,
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.text,
  },
  toastText: {
    fontSize: tokens.fontSize.body,
    color: tokens.color.primaryText,
    textAlign: "center",
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacing.lg,
    backgroundColor: tokens.color.overlay,
  },
  modal: {
    width: "100%",
    gap: tokens.spacing.sm,
    padding: tokens.spacing.lg,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
  },
});
