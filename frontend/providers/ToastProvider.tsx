import Ionicons from "@expo/vector-icons/Ionicons";
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useReduceMotion } from "../components/ui/useReduceMotion";
import { useTheme, useThemedStyles } from "./ThemeProvider";
import { Theme } from "../theme/themes";

const TOAST_MS = 3000;
/** Long enough to read and reach Undo (DESIGN.md §7.3). */
const UNDO_MS = 6000;

type Tone = "success" | "warning" | "error";

type ToastOptions = {
  /** Shows an Undo button; the toast stays a little longer. */
  undo?: () => void;
  tone?: Tone;
};

type ToastValue = {
  /** Short message (DESIGN.md §7.3). Never the only signal for DANGER. */
  show: (message: string, options?: ToastOptions) => void;
  /** A pinned footer reports its height so the toast sits above it, not on it. Pass 0 to clear. */
  setBottomInset: (height: number) => void;
};

const ToastContext = createContext<ToastValue>({ show: () => {}, setBottomInset: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reduce = useReduceMotion();
  const [bottomInset, setBottomInset] = useState(0);
  const [toast, setToast] = useState<{ id: number; message: string; options: ToastOptions } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.options.undo ? UNDO_MS : TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const show = useCallback((message: string, options: ToastOptions = {}) => setToast({ id: Date.now(), message, options }), []);
  const value = useMemo(() => ({ show, setBottomInset }), [show]);
  // Web: the toast rises a little and fades in (CSS, so nothing moves under a pointer); Reduce motion shows it in place.
  const enter =
    Platform.OS === "web" && !reduce
      ? ({
          animationKeyframes: [{ from: { opacity: 0, transform: [{ translateY: 12 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } }],
          animationDuration: "200ms",
          animationTimingFunction: "cubic-bezier(0.215, 0.61, 0.355, 1)",
        } as object)
      : null;

  const tone: Tone = toast?.options.tone ?? "success";
  const iconColor = tone === "success" ? theme.color.success : tone === "warning" ? theme.color.warning : theme.color.error;

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {toast ? (
          <View
            key={toast.id}
            accessibilityRole="alert"
            pointerEvents={toast.options.undo ? "box-none" : "none"}
            style={[
              styles.toast,
              tone === "warning" && styles.toastWarning,
              tone === "error" && styles.toastError,
              { bottom: theme.layout.tabBarHeight + theme.spacing.md + bottomInset },
              enter,
            ]}
            testID="toast"
          >
            <Ionicons name={tone === "success" ? "checkmark-circle" : "alert-circle"} size={theme.icon.sm} color={iconColor} />
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
      // Above the tab bar and any pinned footer (bottom is set at render).
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.success,
      // Hex + "D9" = 85% opacity: the page shows through a little.
      backgroundColor: `${theme.color.successSurface}D9`,
    },
    toastWarning: {
      borderColor: theme.color.warning,
      backgroundColor: `${theme.color.warningSurface}D9`,
    },
    toastError: {
      borderColor: theme.color.error,
      backgroundColor: `${theme.color.errorSurface}D9`,
    },
    text: {
      flex: 1,
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    undo: { minHeight: 36, justifyContent: "center", paddingHorizontal: theme.spacing.sm },
    undoText: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
  });
