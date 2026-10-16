import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "./ui/Avatar";
import { Chip } from "./ui/Chip";
import { SERVICE_LABEL, SitterSummary, ownersSetting, sitterMeta } from "../features/sitters/sitterApi";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  sitter: SitterSummary;
  /** e.g. "2 stays with you" for "Your sitters". */
  note?: string;
  onPress: () => void;
};

/** Sitter row for "Your sitters" and search results (3B.2–3B.3): initial, name, area, services. */
export function SitterCard({ sitter, note, onPress }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const meta = sitterMeta(sitter);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[sitter.displayName, meta, note].filter(Boolean).join(", ")}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={`sitter-card-${sitter.displayName}`}
    >
      <Avatar kind="initial" name={sitter.displayName} size={56} />
      <View style={styles.body}>
        <Text style={styles.name}>{sitter.displayName}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {note ? <Text style={styles.meta}>{note}</Text> : null}
        <View style={styles.services}>
          {sitter.services.map((service) => (
            <Chip key={service} label={SERVICE_LABEL[service]} />
          ))}
          {sitter.acceptsMultipleOwners !== undefined ? <Chip label={ownersSetting(sitter.acceptsMultipleOwners).badge} /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={theme.icon.sm} color={theme.color.textMuted} />
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    pressed: {
      opacity: 0.8,
    },
    body: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    name: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    meta: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    services: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xs,
    },
  });
