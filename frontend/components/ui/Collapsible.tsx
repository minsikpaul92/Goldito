import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { Card } from "./Card";
import { Icon } from "./Icon";

type Props = {
  title: string;
  open: boolean;
  /** Shown under the title while the card is closed (the value, one line). */
  summary?: string;
  onToggle: () => void;
  children: ReactNode;
  testID?: string;
  toggleTestID?: string;
  /** Keep the closed body in the page, hidden (long reading pages: Privacy, Terms; text stays findable). */
  keepMounted?: boolean;
};

/** A card whose header opens and closes it, with a chevron that points down when open. For groups that stay out of the way. */
export function Collapsible({ title, open, summary, onToggle, children, testID, toggleTestID, keepMounted }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Card style={styles.card} testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        testID={toggleTestID}
      >
        <View style={styles.heading}>
          <Text style={styles.title}>{title}</Text>
          {!open && summary ? (
            <Text style={styles.summary} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <View style={[styles.chevron, !open && styles.chevronClosed]}>
          <Icon name="expand" size={20} color={theme.color.textMuted} />
        </View>
      </Pressable>
      {open || keepMounted ? <View style={open ? styles.body : styles.hidden}>{children}</View> : null}
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { padding: 0, overflow: "hidden" },
    header: {
      minHeight: theme.layout.touchTarget,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.md,
    },
    pressed: { opacity: 0.6 },
    heading: { flex: 1, paddingVertical: theme.spacing.sm },
    summary: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    chevron: { paddingLeft: theme.spacing.sm },
    chevronClosed: { transform: [{ rotate: "-90deg" }] },
    hidden: { display: "none" },
    body: { gap: theme.spacing.md, paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md },
  });
