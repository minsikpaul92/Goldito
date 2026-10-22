import { ReactNode, forwardRef } from "react";
import { Platform, ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  children: ReactNode;
  contentStyle?: ViewStyle;
  /** Keep a thin visible scrollbar on the desktop frame (long pages, the diary). */
  scrollbar?: boolean;
  /** Pinned under the scroll area, always visible (a primary action on a long form). */
  footer?: ReactNode;
  testID?: string;
};

export const Screen = forwardRef<ScrollView, Props>(function Screen({ children, contentStyle, scrollbar, footer, testID }, ref) {
  const styles = useThemedStyles(makeStyles);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        ref={ref}
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        {...(scrollbar && Platform.OS === "web" ? ({ dataSet: { scrollbar: "true" } } as object) : null)}
        testID={testID}
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    content: {
      flexGrow: 1,
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    footer: {
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
      backgroundColor: theme.color.background,
    },
  });
