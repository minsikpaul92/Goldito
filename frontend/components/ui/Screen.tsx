import { useFocusEffect } from "expo-router";
import { ReactNode, forwardRef, useCallback, useState } from "react";
import { Platform, ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";

type Props = {
  children: ReactNode;
  contentStyle?: ViewStyle;
  /** Keep a thin visible scrollbar on the desktop frame (long pages, the diary). */
  scrollbar?: boolean;
  /** Floats over the bottom of the scroll area, always visible (a primary action on a long form); the content shows around it. */
  footer?: ReactNode;
  testID?: string;
};

export const Screen = forwardRef<ScrollView, Props>(function Screen({ children, contentStyle, scrollbar, footer, testID }, ref) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [footerHeight, setFooterHeight] = useState(0);
  const { setBottomInset } = useToast();
  const hasFooter = Boolean(footer);
  // Toasts rise above the pinned footer while this screen is the one in view.
  useFocusEffect(
    useCallback(() => {
      if (!hasFooter) return;
      setBottomInset(footerHeight);
      return () => setBottomInset(0);
    }, [hasFooter, footerHeight, setBottomInset]),
  );
  // Content fades out behind the floating button instead of ending on a hard box edge.
  const gradient = `linear-gradient(to bottom, transparent, ${theme.color.background} 70%)`;
  const fadeStyle = (Platform.OS === "web" ? { backgroundImage: gradient } : { experimental_backgroundImage: gradient }) as ViewStyle;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        ref={ref}
        contentContainerStyle={[styles.content, contentStyle, footer ? { paddingBottom: footerHeight } : null]}
        keyboardShouldPersistTaps="handled"
        {...(scrollbar && Platform.OS === "web" ? ({ dataSet: { scrollbar: "true" } } as object) : null)}
        testID={testID}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={styles.footerWrap} pointerEvents="box-none">
          <View style={[styles.fade, fadeStyle]} pointerEvents="none" />
          <View style={styles.footer} onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}>
            {footer}
          </View>
        </View>
      ) : null}
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
    footerWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
    },
    fade: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    footer: {
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
