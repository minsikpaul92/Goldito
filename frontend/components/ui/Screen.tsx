import { useFocusEffect } from "expo-router";
import { ReactNode, useCallback, useState } from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { useSetFooterInset } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";

type Props = {
  children: ReactNode;
  contentStyle?: ViewStyle;
  /**
   * The screen's one primary action, pinned under the scroll area so it is always visible
   * (DESIGN.md §7.1, desktop checklist). Toasts sit above it.
   */
  footer?: ReactNode;
};

export function Screen({ children, contentStyle, footer }: Props) {
  const styles = useThemedStyles(makeStyles);
  const setFooterInset = useSetFooterInset();
  const [footerHeight, setFooterHeight] = useState(0);
  const hasFooter = footer != null;

  useFocusEffect(
    useCallback(() => {
      setFooterInset(hasFooter ? footerHeight : 0);
      return () => setFooterInset(0);
    }, [hasFooter, footerHeight, setFooterInset]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, contentStyle]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? (
        <View style={styles.footer} onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}>
          <View style={styles.footerInner}>{footer}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    content: {
      flexGrow: 1,
      padding: theme.spacing.md,
      maxWidth: theme.layout.contentMaxWidth,
      width: "100%",
      alignSelf: "center",
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      backgroundColor: theme.color.background,
    },
    footerInner: {
      padding: theme.spacing.md,
      gap: theme.spacing.xs,
      maxWidth: theme.layout.contentMaxWidth,
      width: "100%",
      alignSelf: "center",
    },
  });
