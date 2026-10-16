import { Image, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props =
  /** A person: first letter of the name (Figma `Kind=Initial`). */
  | { kind: "initial"; name: string; size?: number; testID?: string }
  /** A pet photo (Figma `Kind=Photo`). */
  | { kind: "photo"; uri: string; size?: number; testID?: string }
  /** A species or tool emoji on the soft accent circle (pets without a photo, Snap tools). */
  | { kind: "emoji"; emoji: string; size?: number; testID?: string };

/** Figma: Goldito-Design → Components → Avatar (Kind). Round; default 40 like Figma, callers may pass a size. */
export function Avatar(props: Props) {
  const styles = useThemedStyles(makeStyles);
  const size = props.size ?? 40;
  const circle = { width: size, height: size, borderRadius: size / 2 };

  if (props.kind === "photo") {
    return <Image source={{ uri: props.uri }} style={[styles.photo, circle]} testID={props.testID} />;
  }
  if (props.kind === "initial") {
    return (
      <View style={[styles.circle, styles.initialCircle, circle]} testID={props.testID}>
        <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{props.name.slice(0, 1).toUpperCase()}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.circle, styles.emojiCircle, circle]} testID={props.testID}>
      <Text style={{ fontSize: size * 0.5 }}>{props.emoji}</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    circle: { alignItems: "center", justifyContent: "center" },
    initialCircle: { backgroundColor: theme.color.primary },
    initial: { fontWeight: theme.fontWeight.semibold, color: theme.color.primaryText },
    emojiCircle: { backgroundColor: theme.color.accent },
    photo: { backgroundColor: theme.color.border },
  });
