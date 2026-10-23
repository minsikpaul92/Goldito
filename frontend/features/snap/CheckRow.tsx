import { Pressable, StyleSheet, Text, View } from "react-native";

import { Art } from "../../components/art/Art";
import { HOME_TEXT } from "../../components/home/homeType";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { StatusBadge } from "./TreatCheckScreen";
import type { SafetyCheck } from "./treatApi";

/** One line on why a check came out as it did: "Chicken · Max is allergic", "Nothing on Max's list". */
export function checkReason(check: SafetyCheck, petName: string): string {
  const first = (list: string[]) => (list[0] ? list[0][0].toUpperCase() + list[0].slice(1) : null);
  if (check.matched_allergens.length > 0) return `${first(check.matched_allergens)} · ${petName} is allergic`;
  if (check.toxic_ingredients.length > 0) return `${first(check.toxic_ingredients)} · not safe for ${petName}`;
  if (check.hidden_sources.length > 0) return `${first(check.hidden_sources.map((h) => h.may_contain))} · may be hiding in the label`;
  if (check.safety_status === "SAFE") return `Nothing on ${petName}'s list`;
  return check.partial_label ? "Part of the label is missing" : "Some ingredients are unclear";
}

/** A saved treat check as a row (Figma "it"): the drawing, the product, the reason, the verdict. */
export function CheckRow({ check, petName, onPress, testID }: { check: SafetyCheck; petName: string; onPress: () => void; testID?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} testID={testID}>
      <Art name="snap/recent-bowl" size={52} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {check.product_name || "Treat label"}
        </Text>
        <Text style={styles.reason} numberOfLines={1}>
          {checkReason(check, petName)}
        </Text>
      </View>
      <StatusBadge status={check.safety_status} />
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 8, paddingRight: 14, paddingVertical: 8, borderRadius: 22, backgroundColor: theme.color.surface },
    pressed: { opacity: 0.85 },
    body: { flex: 1, minWidth: 0, gap: 1 },
    name: { fontSize: HOME_TEXT.row, lineHeight: 21, fontWeight: theme.fontWeight.bold, letterSpacing: -0.15, color: theme.color.text },
    reason: { fontSize: HOME_TEXT.body, lineHeight: 17.5, color: theme.color.textMuted },
  });
