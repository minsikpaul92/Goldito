import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from "react-native";

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
  /** Something the person didn't do (a notification): waits while an Undo toast is up instead of replacing it (U9). */
  passive?: boolean;
};

type ToastValue = {
  /** Short message (DESIGN.md §7.3). Never the only signal for DANGER. */
  show: (message: string, options?: ToastOptions) => void;
  /** A pinned footer reports its height so the toast sits above it, not on it. Pass 0 to clear. */
  setBottomInset: (height: number) => void;
  /** The tab bar reports its real height while a tab screen is in view (0 on other screens, #371). */
  setTabBarInset: (height: number) => void;
};

const ToastContext = createContext<ToastValue>({ show: () => {}, setBottomInset: () => {}, setTabBarInset: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reduce = useReduceMotion();
  const [bottomInset, setBottomInset] = useState(0);
  const [tabBarInset, setTabBarInset] = useState(0);
  const [toast, setToast] = useState<{ id: number; message: string; options: ToastOptions } | null>(null);

  // Passive toasts that arrived while an Undo toast was up; shown in turn once it goes.
  const waiting = useRef<{ id: number; message: string; options: ToastOptions }[]>([]);

  useEffect(() => {
    if (!toast) {
      const next = waiting.current.shift();
      if (next) setToast(next);
      return;
    }
    const timer = setTimeout(() => setToast(null), toast.options.undo ? UNDO_MS : TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    const next = { id: Date.now(), message, options };
    setToast((current) => {
      // Never take the person's Undo away: a notification waits its turn (the bell has it already).
      if (options.passive && current?.options.undo) {
        waiting.current.push(next);
        return current;
      }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ show, setBottomInset, setTabBarInset }), [show]);
  // Just above what is really at the bottom (#371): the tab bar on a tab screen, plus a pinned footer when one reports
  // itself. A screen that reports neither keeps the old height, which clears a bar of buttons it draws itself.
  const below = tabBarInset > 0 || bottomInset > 0 ? tabBarInset + bottomInset : theme.layout.tabBarHeight;
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
              { bottom: below + theme.spacing.md },
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

/**
 * For a bar of buttons pinned to the bottom that is not a `Screen` footer: put the returned handler on its `onLayout` and
 * the toast sits above it while the screen is in view (#371).
 */
export function useToastAbove(): (event: LayoutChangeEvent) => void {
  const { setBottomInset } = useToast();
  const [height, setHeight] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (height <= 0) return;
      setBottomInset(height);
      return () => setBottomInset(0);
    }, [height, setBottomInset]),
  );
  return useCallback((event: LayoutChangeEvent) => setHeight(Math.round(event.nativeEvent.layout.height)), []);
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
      // Above the tab bar or a pinned footer (bottom is set at render).
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
