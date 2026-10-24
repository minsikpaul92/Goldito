import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Art } from "./art/Art";
import { HOME_TEXT } from "./home/homeType";
import { Icon } from "./ui/Icon";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type FeedPetOption = { id: string; name: string; species: "dog" | "cat" };

/** Pets in the order shown; a line is drawn between groups (it cannot be picked). */
export type FeedPetGroup = { key: string; hint?: string; pets: FeedPetOption[] };

type Props = {
  groups: FeedPetGroup[];
  value: string | null;
  onChange: (petId: string) => void;
  testID?: string;
};

type Anchor = { x: number; y: number; width: number; height: number };

/**
 * The pet of the Feed as a dropdown next to the filter chips: the pet on screen is the chosen one, the list drops down
 * right under it. A sitter sees the pets in care first, a line, then the pets of stays that are over; an owner sees
 * their own.
 */
export function FeedPetPicker({ groups, value, onChange, testID = "feed-pet" }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const pill = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const all = groups.flatMap((g) => g.pets);
  const chosen = all.find((p) => p.id === value) ?? all[0];
  if (!chosen) return null;

  const open = () => pill.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  const close = () => setAnchor(null);

  return (
    <>
      <Pressable
        ref={pill}
        accessibilityRole="button"
        accessibilityLabel={`Pet: ${chosen.name}`}
        aria-haspopup="listbox"
        aria-expanded={anchor != null}
        onPress={open}
        style={styles.pill}
        testID={testID}
      >
        <Art name={chosen.species === "cat" ? "snap/chip-cat" : "snap/chip-dog"} size={28} />
        <Text style={styles.name} numberOfLines={1}>
          {chosen.name}
        </Text>
        <Icon name="expand" size={16} color={theme.color.textMuted} />
      </Pressable>
      <Modal visible={anchor != null} transparent animationType="fade" onRequestClose={close}>
        <Pressable accessibilityLabel="Close" onPress={close} style={StyleSheet.absoluteFill} testID={`${testID}-backdrop`} />
        {anchor ? (
          <View
            accessibilityRole="menu"
            style={[styles.menu, { top: anchor.y + anchor.height + 4, left: anchor.x, minWidth: Math.max(anchor.width, 200) }]}
            testID={`${testID}-menu`}
          >
            {groups
              .filter((g) => g.pets.length > 0)
              .map((group, index) => (
                <View key={group.key}>
                  {index > 0 ? <View style={styles.line} testID={`${testID}-line`} /> : null}
                  {group.pets.map((pet) => {
                    const on = pet.id === chosen.id;
                    return (
                      <Pressable
                        key={pet.id}
                        accessibilityRole="radio"
                        aria-checked={on}
                        onPress={() => {
                          onChange(pet.id);
                          close();
                        }}
                        style={[styles.row, on && styles.rowOn]}
                        testID={`${testID}-${pet.id}`}
                      >
                        <Art name={pet.species === "cat" ? "snap/chip-cat" : "snap/chip-dog"} size={24} />
                        <View style={styles.rowText}>
                          <Text style={[styles.rowName, on && styles.rowNameOn]} numberOfLines={1}>
                            {pet.name}
                          </Text>
                          {group.hint ? <Text style={styles.rowHint}>{group.hint}</Text> : null}
                        </View>
                        {on ? <Icon name="check" size={18} color={theme.color.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 6,
      paddingRight: 10,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
      maxWidth: 150,
    },
    name: { flexShrink: 1, fontSize: HOME_TEXT.chip, lineHeight: 18.2, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    menu: {
      position: "absolute",
      maxWidth: 320,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      shadowColor: theme.color.text,
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: theme.spacing.md },
    rowOn: { backgroundColor: theme.color.accent },
    rowText: { flex: 1, minWidth: 0 },
    rowName: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    rowNameOn: { fontWeight: theme.fontWeight.bold },
    rowHint: { fontSize: theme.fontSize.caption, color: theme.color.textMuted },
    line: { height: 1, backgroundColor: theme.color.border, marginVertical: theme.spacing.xs },
  });
