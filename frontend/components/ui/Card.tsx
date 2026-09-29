import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { tokens } from "../../theme/tokens";

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

export function Card({ children, style }: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
});
