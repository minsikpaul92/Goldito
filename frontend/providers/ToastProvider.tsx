import Ionicons from "@expo/vector-icons/Ionicons";
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "./ThemeProvider";
import { Theme } from "../theme/themes";

const TOAST_MS = 3000;

type ToastValue = {
  /** Short message (DESIGN.md §7.3). Never the only signal for DANGER. */
  show: (message: string, tone?: "success" | "error") => void;
  /** A pinned footer reports its height so the toast sits above it, not on it. Pass 0 to clear. */
  setBottomInset: (height: number) => void;
};

const ToastContext = createContext<ToastValue>({ show: () => {}, setBottomInset: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [bottomInset, setBottomInset] = useState(0);
  const [toast, setToast] = useState<{ id: number; message: string; tone: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const show = useCallback(
    (message: string, tone: "success" | "error" = "success") => setToast({ id: Date.now(), message, tone }),
    [],
  );
  const value = useMemo(() => ({ show, setBottomInset }), [show]);

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {toast ? (
          <View
            accessibilityRole="alert"
            pointerEvents="none"
            style={[styles.toast, toast.tone === "error" && styles.toastError, { bottom: theme.layout.tabBarHeight + theme.spacing.md + bottomInset }]}
            testID="toast"
          >
            <Ionicons
              name={toast.tone === "error" ? "alert-circle" : "checkmark-circle"}
              size={theme.icon.sm}
              color={toast.tone === "error" ? theme.color.error : theme.color.success}
            />
            <Text style={styles.text}>{toast.message}</Text>
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
      backgroundColor: theme.color.successSurface,
    },
    toastError: {
      borderColor: theme.color.error,
      backgroundColor: theme.color.errorSurface,
    },
    text: {
      flex: 1,
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
  });
