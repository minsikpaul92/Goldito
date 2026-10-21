import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { Button } from "../../components/ui/Button";
import { Sheet } from "../../components/ui/Sheet";
import { TextButton } from "../../components/ui/TextButton";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { deleteDiaryPage, hideDiaryPage } from "./reportApi";

type Props = {
  reportId: string;
  /** "delete": the writer's own page. "hide": a sitter's page, taken out of the owner's book only. */
  action: "delete" | "hide";
  /** Who else loses the page when it is deleted ("the owner"), or keeps their copy when it is hidden ("Chloe"). */
  other?: string;
  /** The page is gone (or hidden): the parent reloads. */
  onDone: () => void;
  testID?: string;
};

/** "Delete page" / "Hide page" under a diary page, with a short confirm. */
export function PageActions({ reportId, action, other, onDone, testID = `diary-page-${action}-${reportId}` }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const hide = action === "hide";

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await (hide ? hideDiaryPage(reportId) : deleteDiaryPage(reportId));
      setAsking(false);
      toast.show(hide ? "Page hidden" : "Page deleted");
      onDone();
    } catch (e) {
      setAsking(false);
      errorDialog.show({ title: hide ? "Page not hidden" : "Page not deleted", message: (e as Error).message, onRetry: () => void run() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TextButton label={hide ? "Hide page" : "Delete page"} danger onPress={() => setAsking(true)} testID={testID} />
      <Sheet
        visible={asking}
        title={hide ? "Hide this page?" : "Delete this page?"}
        onClose={() => (busy ? undefined : setAsking(false))}
        testID={`${testID}-sheet`}
      >
        <Text style={styles.body}>
          {hide
            ? `It leaves your diary.${other ? ` ${other} keeps their copy.` : ""}`
            : `It is deleted for good.${other ? ` ${other} loses it too.` : ""}`}
        </Text>
        <Button label={busy ? "Please wait…" : hide ? "Hide" : "Delete"} variant={hide ? "primary" : "danger"} onPress={() => void run()} disabled={busy} testID={`${testID}-confirm`} />
      </Sheet>
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
