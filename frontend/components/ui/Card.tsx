import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
};

export function Card({ children, style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
  });
