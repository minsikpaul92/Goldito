import { Pressable, StyleSheet, Text, View } from "react-native";

import { itemName, type PetItem } from "../../features/pets/items";
import { HATS, type HatId } from "../../features/pets/sprites/hats";
import { FIXED } from "../../features/pets/sprites/scene";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { sectionTitleStyle } from "../ui/SectionTitle";
import { Icon } from "../ui/Icon";
import { PixelGrid } from "./PixelGrid";

/** Tiles waiting for items that are not out yet: room for more looks later. */
const LOCKED = 1;

/** The hat's own front picture, in its fixed colors (built once per hat). */
const pictures = new Map<HatId, (string | null)[][]>();
function hatPixels(id: HatId) {
  let picture = pictures.get(id);
  if (!picture) {
    picture = HATS[id].views.front.map((row) => [...row].map((role) => (role === "." ? null : FIXED[role] ?? null)));
    pictures.set(id, picture);
  }
  return picture;
}

/**
 * The Wardrobe under the pet room (room trial R1+, Oct 27): one tile per item in even columns that fill the row and
 * wrap at large text. Every tile has the same three rows (art, name, status) so they line up; the worn one has the
 * accent fill and a check, a locked one a dashed edge and a lock in the same corner. Tap an item to put it on or off.
 */
export function PetWardrobe({ items, worn, onToggle }: { items: PetItem[]; worn: HatId | null; onToggle: (id: HatId) => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const total = items.length + LOCKED;

  return (
    <View style={styles.root} testID="pet-wardrobe">
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>
          Wardrobe
        </Text>
        <Text style={styles.count}>{`${items.length} of ${total} unlocked`}</Text>
      </View>
      <View style={styles.grid}>
        {items.map((item) => {
          const on = worn === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${itemName(item)}, ${on ? "wearing" : "not wearing"}`}
              aria-pressed={on}
              onPress={() => onToggle(item.id)}
              style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && styles.pressed]}
              testID={`pet-hat-${item.id}`}
            >
              {on ? (
                <View style={[styles.badge, styles.badgeOn]}>
                  <Icon name="check" size={14} strokeWidth={3} color={theme.color.primaryText} />
                </View>
              ) : null}
              <View style={styles.art}>
                <PixelGrid pixels={hatPixels(item.id)} pixel={3} />
              </View>
              <Text style={styles.name}>{itemName(item)}</Text>
              <Text style={[styles.status, on && styles.statusOn]}>{on ? "Wearing" : "Tap to wear"}</Text>
            </Pressable>
          );
        })}
        {Array.from({ length: LOCKED }, (_, i) => (
          <View key={`locked-${i}`} style={[styles.tile, styles.tileLocked]} accessibilityLabel="More items, locked. Coming soon." testID="pet-item-locked">
            <View style={[styles.badge, styles.badgeLocked]}>
              <Icon name="lock" size={12} color={theme.color.textMuted} />
            </View>
            <View style={styles.art}>
              <Icon name="paw" size={28} color={theme.color.borderStrong} />
            </View>
            <Text style={styles.name}>More soon</Text>
            <Text style={styles.status}>New looks</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.sm },
    head: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: theme.spacing.md },
    title: sectionTitleStyle(theme),
    count: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    // Even columns: each tile grows from the same base, so two or three share the row and big text wraps them.
    tile: {
      flexGrow: 1,
      flexBasis: 100,
      minHeight: 132,
      alignItems: "center",
      gap: 6,
      paddingTop: 14,
      paddingBottom: 12,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.lg,
      borderWidth: 1.5,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    tileOn: { borderWidth: 2, borderColor: theme.color.primary, backgroundColor: theme.color.accent },
    tileLocked: { borderStyle: "dashed", borderColor: theme.color.borderStrong, backgroundColor: theme.color.background },
    pressed: { opacity: 0.85 },
    badge: { position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    badgeOn: { backgroundColor: theme.color.primary },
    badgeLocked: { borderWidth: 1.5, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surface },
    art: { height: 44, alignItems: "center", justifyContent: "center" },
    name: { fontSize: theme.fontSize.small + 1, lineHeight: 18, fontWeight: theme.fontWeight.bold, color: theme.color.text, textAlign: "center" },
    status: { marginTop: "auto", fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted, textAlign: "center" },
    statusOn: { color: theme.color.primary, fontWeight: theme.fontWeight.bold },
  });
