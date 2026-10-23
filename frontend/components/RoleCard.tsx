import { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, IconName } from "./ui/Icon";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  icon: IconName;
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
};

/** Big tappable role choice on Sign up (and later Welcome, OB.2). */
export function RoleCard({
  icon,
  title,
  description,
  selected,
  onPress,
  testID,
}: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      aria-checked={selected}
      onPress={onPress}
      style={[styles.card, selected && styles.selected]}
    >
      <Icon name={icon} size={theme.icon.md} color={theme.color.primary} />
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </View>
      <Icon
        name={selected ? "radioOn" : "radioOff"}
        size={theme.icon.sm}
        color={selected ? theme.color.primary : theme.color.border}
      />
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      minHeight: 48,
      paddingVertical: 10,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    selected: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    text: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    description: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
  });
