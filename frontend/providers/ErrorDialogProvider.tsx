import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { TextButton } from "../components/ui/TextButton";
import { Theme } from "../theme/themes";
import { useThemedStyles } from "./ThemeProvider";

type ErrorDialog = {
  title?: string;
  message: string;
  /** Adds a "Try again" button that closes the dialog and runs this. */
  onRetry?: () => void;
};

type Value = {
  /**
   * A failure the user must notice (an upload that didn't go through, a check-in that wasn't
   * sent). Unlike a toast it stays until it is closed — the user shouldn't have to guess.
   */
  show: (dialog: ErrorDialog) => void;
};

const Context = createContext<Value>({ show: () => {} });

export function ErrorDialogProvider({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const [dialog, setDialog] = useState<ErrorDialog | null>(null);
  const show = useCallback((next: ErrorDialog) => setDialog(next), []);
  const value = useMemo(() => ({ show }), [show]);
  const close = () => setDialog(null);

  return (
    <Context.Provider value={value}>
      {children}
      <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View accessibilityRole="alert" accessibilityViewIsModal style={styles.card} testID="error-dialog">
            <Text style={styles.title}>{dialog?.title ?? "That didn't go through"}</Text>
            <Text style={styles.message} testID="error-dialog-message">
              {dialog?.message}
            </Text>
            {dialog?.onRetry ? (
              <Button
                label="Try again"
                onPress={() => {
                  const retry = dialog.onRetry;
                  close();
                  retry?.();
                }}
                testID="error-dialog-retry"
              />
            ) : null}
            <TextButton label="Close" onPress={close} testID="error-dialog-close" />
          </View>
        </View>
      </Modal>
    </Context.Provider>
  );
}

export function useErrorDialog(): Value {
  return useContext(Context);
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.lg,
      backgroundColor: theme.color.overlay,
    },
    card: {
      width: "100%",
      maxWidth: 360,
      gap: theme.spacing.sm,
      padding: theme.spacing.lg,
      borderRadius: theme.radius.lg,
      borderWidth: 2,
      borderColor: theme.color.error,
      backgroundColor: theme.color.surface,
    },
    title: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.error },
    message: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: theme.fontSize.body * 1.4 },
  });
