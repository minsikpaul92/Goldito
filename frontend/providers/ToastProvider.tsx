import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useReduceMotion } from "../components/ui/useReduceMotion";
import { useThemedStyles } from "./ThemeProvider";
import { Theme } from "../theme/themes";

const TOAST_MS = 3000;
/** Long enough to read and reach Undo (DESIGN.md §7.3). */
const UNDO_MS = 6000;

type ToastOptions = {
  /** Shows an Undo button; the toast stays a little longer. */
  undo?: () => void;
  tone?: "default" | "error";
};

type ToastValue = {
  /** Short status message (DESIGN.md §7.3). Never the only signal for DANGER. */
  show: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastValue>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const [toast, setToast] = useState<{ id: number; message: string; options: ToastOptions } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.options.undo ? UNDO_MS : TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const show = useCallback((message: string, options: ToastOptions = {}) => setToast({ id: Date.now(), message, options }), []);
  const value = useMemo(() => ({ show }), [show]);
  // Web: the toast rises a little and fades in (CSS, so nothing moves under a pointer); Reduce motion shows it in place.
  const enter =
    Platform.OS === "web" && !reduce
      ? ({
          animationKeyframes: [{ from: { opacity: 0, transform: [{ translateY: 12 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } }],
          animationDuration: "200ms",
          animationTimingFunction: "cubic-bezier(0.215, 0.61, 0.355, 1)",
        } as object)
      : null;

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {toast ? (
          <View
            key={toast.id}
            accessibilityRole="alert"
            pointerEvents="box-none"
            style={[styles.toast, toast.options.tone === "error" && styles.error, enter]}
            testID="toast"
          >
            <Text style={styles.text}>{toast.message}</Text>
            {toast.options.undo ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  toast.options.undo?.();
                  setToast(null);
                }}
                hitSlop={8}
                style={styles.undo}
                testID="toast-undo"
              >
                <Text style={styles.undoText}>Undo</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  return useContext(ToastContext);
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
      // Above the bottom tab bar and the one pinned action.
      bottom: theme.layout.tabBarHeight + theme.spacing.md,
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.text,
    },
    error: { backgroundColor: theme.color.error },
    text: {
      flex: 1,
      fontSize: theme.fontSize.body,
      color: theme.color.primaryText,
    },
    undo: { minHeight: 36, justifyContent: "center", paddingHorizontal: theme.spacing.sm },
    undoText: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.gold },
  });
