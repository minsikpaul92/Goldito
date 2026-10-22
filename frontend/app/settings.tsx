import Constants from "expo-constants";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { ListGroup, ListRow } from "../components/ui/ListRow";
import { LoadingView } from "../components/ui/LoadingView";
import { Screen } from "../components/ui/Screen";
import { SectionTitle } from "../components/ui/SectionTitle";
import { Sheet } from "../components/ui/Sheet";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** Menu → Settings (Phase 11.11, D47; Figma List Row 1673:31755): the account (opens Profile), notifications, Privacy, Sign out and the version. */
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
      <SectionTitle>Account</SectionTitle>
      <ListGroup testID="settings-account">
        <ListRow
          title={profile.displayName}
          detail={`${session.session?.user.email ?? ""} · ${profile.role === "owner" ? "Pet owner" : "Pet sitter"}`}
          onPress={() => router.push("/profile")}
          testID="settings-edit-profile"
        />
      </ListGroup>

      <SectionTitle>Notifications</SectionTitle>
      <ListGroup testID="settings-notifications">
        <ListRow title="In the app" detail="The bell and a short message while Goldito is open" trailing={{ kind: "none" }} />
        <ListRow title="Phone notifications and quiet hours" detail="These are not available yet" trailing={{ kind: "none" }} disabled />
      </ListGroup>

      <SectionTitle>About</SectionTitle>
      <ListGroup>
        <ListRow title="Privacy" onPress={() => router.push("/privacy")} testID="settings-privacy" />
      </ListGroup>

      <ListGroup>
        <ListRow title="Sign out" danger onPress={() => setConfirmLogOut(true)} testID="settings-log-out" />
      </ListGroup>
      <Text style={styles.version} testID="settings-version">
        Goldito {version}
      </Text>
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
    version: { fontSize: theme.fontSize.small, color: theme.color.textMuted, textAlign: "center" },
  });
