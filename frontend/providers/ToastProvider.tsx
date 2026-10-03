import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text } from "react-native";

import { nativeDriver, useReducedMotion } from "../components/ui/motion";
import { useTheme, useThemedStyles } from "./ThemeProvider";
import { Theme } from "../theme/themes";

const TOAST_MS = 3000;

type ToastValue = {
  /** Short success message (DESIGN.md §7.3). Never the only signal for DANGER. */
  show: (message: string) => void;
};

const ToastContext = createContext<ToastValue>({ show: () => {} });
/** The focused screen's pinned footer height, so a toast never covers its primary action. */
const FooterInsetContext = createContext<(height: number) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduced = useReducedMotion();
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [footerInset, setFooterInset] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: theme.motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: nativeDriver,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(progress, { toValue: 0, duration: theme.motion.fast, useNativeDriver: nativeDriver }).start(
        () => setToast(null),
      );
    }, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, progress, theme]);

  const show = useCallback((message: string) => setToast({ id: Date.now(), message }), []);
  const value = useMemo(() => ({ show }), [show]);

  const enter = reduced
    ? []
    : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [theme.spacing.sm, 0] }) }];

  return (
    <ToastContext.Provider value={value}>
      <FooterInsetContext.Provider value={setFooterInset}>
        <Animated.View style={styles.root}>
          {children}
          {toast ? (
            <Animated.View
              accessibilityRole="alert"
              pointerEvents="none"
              style={[styles.toast, { bottom: styles.toast.bottom + footerInset, opacity: progress, transform: enter }]}
              testID="toast"
            >
              <Text style={styles.text}>{toast.message}</Text>
            </Animated.View>
          ) : null}
        </Animated.View>
      </FooterInsetContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  return useContext(ToastContext);
}

/** For `Screen`: report the pinned footer's height while the screen is focused. */
export function useSetFooterInset(): (height: number) => void {
  return useContext(FooterInsetContext);
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    toast: {
      position: "absolute",
      left: theme.spacing.md,
      right: theme.spacing.md,
      // Above the bottom tab bar; the focused screen's footer is added on top.
      bottom: theme.layout.tabBarHeight + theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.text,
    },
    text: {
      fontSize: theme.fontSize.body,
      color: theme.color.primaryText,
      textAlign: "center",
    },
  });
