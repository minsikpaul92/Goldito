import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** Tinted color-block grounds (Expressive). Text on them uses `text`. */
export type CardTone = "mint" | "peach" | "butter" | "blush";

type Props = {
  children: ReactNode;
  /** A tinted block with no border. Unset = the plain white card. */
  tone?: CardTone;
  style?: ViewStyle;
  testID?: string;
};

export function Card({ children, tone, style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.card, tone && styles.block, tone && styles[tone], style]} testID={testID}>
      {children}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.ui.radius.card,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    block: {
      borderRadius: theme.ui.radius.block,
      borderWidth: 0,
    },
    mint: { backgroundColor: theme.color.blockMint },
    peach: { backgroundColor: theme.color.blockPeach },
    butter: { backgroundColor: theme.color.blockButter },
    blush: { backgroundColor: theme.color.blockBlush },
  });
