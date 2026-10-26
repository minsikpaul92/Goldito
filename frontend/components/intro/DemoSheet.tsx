import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RoleArt } from "./RoleArt";
import { Sheet } from "../ui/Sheet";
import { DEFAULT_DEMO_SET } from "../../lib/demo";
import { Role } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = { visible: boolean; onClose: () => void };

/**
 * Try the demo (OB.3): one tap picks who to be, then the login screen signs in to that seeded account
 * (/login?demo=owner|sitter does it on arrival).
 */
export function DemoSheet({ visible, onClose }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { owner, sitter, pets } = DEFAULT_DEMO_SET;
  const petNames = `${pets[0]} and ${pets[1]}`;

  function tryAs(role: Role) {
    onClose();
    router.push(`/login?demo=${role}`);
  }

  return (
    <Sheet visible={visible} title="Try Goldito as…" onClose={onClose} testID="demo-sheet">
      <View style={styles.body}>
        <Text style={styles.lead}>No sign-up. Everything resets when you leave.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => tryAs("owner")}
          style={({ pressed }) => [styles.option, styles.owner, pressed && styles.pressed]}
          testID="demo-sheet-owner"
        >
          <RoleArt role="owner" size={76} />
          <View style={styles.text}>
            <Text style={styles.title}>{`${owner.name}, the owner`}</Text>
            <Text style={styles.sub}>{`${petNames} are with ${sitter.name} this weekend. Follow the stay from home.`}</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => tryAs("sitter")}
          style={({ pressed }) => [styles.option, styles.sitter, pressed && styles.pressed]}
          testID="demo-sheet-sitter"
        >
          <RoleArt role="sitter" size={76} />
          <View style={styles.text}>
            <Text style={styles.title}>{`${sitter.name}, the sitter`}</Text>
            <Text style={styles.sub}>{`${petNames} are staying with you. Check in, snap a photo, done.`}</Text>
          </View>
        </Pressable>
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) => {
  const display = theme.fontFamily.display;
  return StyleSheet.create({
    body: { gap: theme.spacing.sm, paddingBottom: theme.spacing.md },
    lead: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.xl,
      minHeight: 44,
    },
    owner: { backgroundColor: theme.color.blockPeach },
    sitter: { backgroundColor: theme.color.blockMint },
    pressed: { opacity: 0.85 },
    text: { flex: 1, gap: 2 },
    title: {
      fontSize: theme.fontSize.lead,
      color: theme.color.text,
      ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.bold }),
    },
    sub: { fontSize: theme.fontSize.small, color: theme.color.text, lineHeight: 20 },
  });
};
