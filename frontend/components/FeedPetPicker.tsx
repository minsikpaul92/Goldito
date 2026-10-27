import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { HOME_TEXT } from "./home/homeType";
import { PetFace } from "./PetFace";
import { Icon } from "./ui/Icon";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type FeedPetOption = { id: string; name: string; species: "dog" | "cat" };

/** Pets in the order shown; a line is drawn between groups (it cannot be picked). */
export type FeedPetGroup = { key: string; hint?: string; pets: FeedPetOption[] };

/** The value of the picker when every pet is shown together. */
export const ALL_PETS = "all";

type Props = {
  groups: FeedPetGroup[];
  /** The pets "All pets" covers; with fewer than two there is no All pets row. */
  allPets: FeedPetOption[];
  /** A pet id, or ALL_PETS. */
  value: string;
  onChange: (value: string) => void;
  /** First photo of each pet, for the faces. */
  faces: Record<string, string | null>;
  /** A short line under a pet's name in the menu, in place of its group's hint (the Diary: "Draft", "Sent"). */
  hints?: Record<string, string>;
  testID?: string;
};

type Anchor = { x: number; y: number; width: number; height: number };

const MENU_MIN = 200;

/**
 * The first filter chip of the Feed (Muk's trial, #345): "All pets" with their faces, a menu that drops right under it
 * to narrow to one pet. A sitter sees the pets in care first, a line, then the pets of stays that are over; an owner
 * sees their own. With one pet there is nothing to pick and the chip is not there.
 */
export function FeedPetPicker({ groups, allPets, value, onChange, faces, hints, testID = "feed-pet" }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const pill = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // The width the menu can use, so a chip at the right end of a row opens its menu leftward.
  const { width: roomWidth } = useWindowDimensions();
  const all = groups.flatMap((g) => g.pets);
  const hasAll = allPets.length > 1;
  const chosen = value === ALL_PETS && hasAll ? null : (all.find((p) => p.id === value) ?? all[0]);
  if (all.length < 2) return null;

  const open = () => pill.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  const close = () => setAnchor(null);
  const face = (p: FeedPetOption, size: number) => <PetFace pet={{ species: p.species, photo: faces[p.id] }} size={size} />;
  const stack = (size: number) => (
    <View style={styles.stack}>
      {allPets.slice(0, 3).map((p, i) => (
        <View key={p.id} style={i > 0 ? { marginLeft: -size * 0.35 } : undefined}>
          {face(p, size)}
        </View>
      ))}
    </View>
  );

  return (
    <>
      <Pressable
        ref={pill}
        accessibilityRole="button"
        accessibilityLabel={`Pet: ${chosen ? chosen.name : "All pets"}`}
        aria-haspopup="listbox"
        aria-expanded={anchor != null}
        onPress={open}
        style={styles.pill}
        testID={testID}
      >
        {chosen ? face(chosen, 28) : stack(28)}
        <Text style={styles.name} numberOfLines={1}>
          {chosen ? chosen.name : "All pets"}
        </Text>
        <Icon name="expand" size={16} color={theme.color.textMuted} />
      </Pressable>
      <Modal visible={anchor != null} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          accessibilityLabel="Close"
          onPress={close}
          style={StyleSheet.absoluteFill}
          testID={`${testID}-backdrop`}
        />
        {anchor ? (
          <View
            accessibilityRole="menu"
            style={[
              styles.menu,
              { top: anchor.y + anchor.height + 4, minWidth: Math.max(anchor.width, MENU_MIN) },
              roomWidth > 0 && anchor.x + Math.max(anchor.width, MENU_MIN) > roomWidth - 8
                ? { right: Math.max(8, roomWidth - anchor.x - anchor.width) }
                : { left: anchor.x },
            ]}
            testID={`${testID}-menu`}
          >
            {hasAll ? (
              <Pressable
                accessibilityRole="radio"
                aria-checked={!chosen}
                onPress={() => {
                  onChange(ALL_PETS);
                  close();
                }}
                style={[styles.row, !chosen && styles.rowOn]}
                testID={`${testID}-all`}
              >
                {stack(24)}
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, !chosen && styles.rowNameOn]}>All pets</Text>
                </View>
                {!chosen ? <Icon name="check" size={18} color={theme.color.primary} /> : null}
              </Pressable>
            ) : null}
            {groups
              .filter((g) => g.pets.length > 0)
              .map((group, index) => (
                <View key={group.key}>
                  {index > 0 ? <View style={styles.line} testID={`${testID}-line`} /> : null}
                  {group.pets.map((pet) => {
                    const on = chosen?.id === pet.id;
                    const hint = hints?.[pet.id] ?? group.hint;
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
                        {face(pet, 24)}
                        <View style={styles.rowText}>
                          <Text style={[styles.rowName, on && styles.rowNameOn]} numberOfLines={1}>
                            {pet.name}
                          </Text>
                          {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
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
      maxWidth: 170,
    },
    stack: { flexDirection: "row", alignItems: "center" },
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
