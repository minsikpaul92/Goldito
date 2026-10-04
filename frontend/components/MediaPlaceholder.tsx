import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  /** Still frame vs short clip slot for Muk / Phase 10 assets. */
  kind: "image" | "video";
  /** Short title shown on the placeholder, e.g. "Owner care feed". */
  title: string;
  /** What to film or shoot later — stays visible until real media ships. */
  brief: string;
  testID?: string;
};

/**
 * Photo-sized media slot for onboarding (~4:3). Parent should center it in leftover space.
 * Swap in real demo media later; the brief tells Muk what belongs here.
 */
export function MediaPlaceholder({ kind, title, brief, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${kind === "video" ? "Video" : "Image"} placeholder: ${title}. ${brief}`}
      style={styles.box}
      testID={testID}
    >
      <View style={styles.center}>
        <Ionicons
          name={kind === "video" ? "videocam-outline" : "image-outline"}
          size={theme.icon.md}
          color={theme.color.primary}
        />
        <Text style={styles.kind}>{kind === "video" ? "Video placeholder" : "Photo placeholder"}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.brief}>{brief}</Text>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    box: {
      // Fill the tour's leftover column so no large empty band sits above/below.
      width: "100%",
      flex: 1,
      minHeight: 200,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: theme.color.border,
      backgroundColor: theme.color.accent,
      padding: theme.spacing.md,
      overflow: "hidden",
    },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    kind: {
      fontSize: theme.fontSize.caption,
      fontWeight: "700",
      color: theme.color.primary,
      textTransform: "uppercase",
    },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: "700",
      color: theme.color.text,
      textAlign: "center",
    },
    brief: {
      fontSize: theme.fontSize.caption,
      color: theme.color.textMuted,
      lineHeight: 16,
      textAlign: "center",
    },
  });
