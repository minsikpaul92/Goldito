import Constants from "expo-constants";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { LoadingView } from "../components/ui/LoadingView";
import { Screen } from "../components/ui/Screen";
import { Sheet } from "../components/ui/Sheet";
import { TextButton } from "../components/ui/TextButton";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** Menu → Settings (Phase 11.11, D47): the account (Edit profile), notifications, Privacy, the app version and Sign out. */
export default function SettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const session = useSession();
  const [confirmLogOut, setConfirmLogOut] = useState(false);
  if (session.status === "loading") return <LoadingView />;
  if (session.status !== "signedIn") return <Redirect href="/welcome" />;
  const { profile } = session;
  const version = Constants.expoConfig?.version ?? "dev";

  return (
    <Screen contentStyle={styles.content} testID="settings">
      <Text accessibilityRole="header" style={styles.heading}>
        Account
      </Text>
      <Card testID="settings-account">
        <Text style={styles.body}>{profile.displayName}</Text>
        <Text style={styles.muted}>
          {session.session?.user.email ?? ""} · {profile.role === "owner" ? "Pet owner" : "Pet sitter"}
        </Text>
        <TextButton label="Edit profile" onPress={() => router.push("/profile")} style={styles.left} testID="settings-edit-profile" />
      </Card>

      <Text accessibilityRole="header" style={styles.heading}>
        Notifications
      </Text>
      <Card testID="settings-notifications">
        <Text style={styles.body}>
          Updates arrive in the app (the bell and a short message) while Goldito is open.
        </Text>
        <Text style={styles.muted}>Phone notifications and quiet hours are not available yet.</Text>
      </Card>

      <Text accessibilityRole="header" style={styles.heading}>
        About
      </Text>
      <Card>
        <TextButton label="Privacy" onPress={() => router.push("/privacy")} style={styles.left} testID="settings-privacy" />
        <Text style={styles.muted} testID="settings-version">
          Goldito {version}
        </Text>
      </Card>
      <Button label="Sign out" variant="secondary" onPress={() => setConfirmLogOut(true)} testID="settings-log-out" />
      <Sheet visible={confirmLogOut} title="Sign out?" onClose={() => setConfirmLogOut(false)} testID="settings-log-out-sheet">
        <View style={styles.confirm}>
          <Button label="Sign out" variant="danger" onPress={() => void session.signOut()} testID="settings-log-out-confirm" />
          <Button label="Cancel" variant="secondary" onPress={() => setConfirmLogOut(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    confirm: { gap: theme.spacing.sm },
    content: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
    heading: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    body: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    left: { alignSelf: "flex-start", paddingHorizontal: 0 },
  });
