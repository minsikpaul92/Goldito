import Constants from "expo-constants";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { BackLink } from "../components/ui/BackLink";
import { List, ListRow } from "../components/ui/ListRow";
import { LoadingView } from "../components/ui/LoadingView";
import { Screen } from "../components/ui/Screen";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { Sheet } from "../components/ui/Sheet";
import { useMyPets } from "../features/pets/useMyPets";
import { useSession } from "../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { tokens } from "../theme/tokens";

/** The first letter of a name on a round ground (Figma: the top right and the green block). */
function Initial({ name, background, color }: { name: string; background: string; color: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.initial, { backgroundColor: background }]}>
      <Text style={[styles.initialText, { color }]}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** The owner's pets, listed by name. Only rendered for owners (sitters have no pets to list). */
function PetsRow() {
  const { pets } = useMyPets();
  return (
    <ListRow
      title="Pets"
      subtitle={pets.length > 0 ? pets.map((p) => p.name).join(" · ") : "None yet"}
      onPress={() => router.push("/owner")}
      testID="settings-pets"
    />
  );
}

/** Menu → Settings (Phase 11.11, D47): the account, What's New, notifications, Privacy, the app version and Sign out. */
export default function SettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const session = useSession();
  const [confirmLogOut, setConfirmLogOut] = useState(false);
  // Figma shows these three switches; there is nothing behind them yet, so they only change on this screen.
  const [tripUpdates, setTripUpdates] = useState(true);
  const [dailyNotes, setDailyNotes] = useState(true);
  const [tips, setTips] = useState(false);
  if (session.status === "loading") return <LoadingView />;
  if (session.status !== "signedIn") return <Redirect href="/welcome" />;
  const { profile } = session;
  const version = Constants.expoConfig?.version ?? "dev";
  const role = profile.role === "owner" ? "Owner" : "Sitter";
  const display = theme.fontFamily.display;

  return (
    <Screen contentStyle={styles.content} testID="settings">
      <BackLink onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} testID="settings-back" />
      <ScreenHeader
        title="Settings"
        right={<Initial name={profile.displayName} background={theme.color.accent} color={theme.color.text} />}
      />

      <View style={styles.me} testID="settings-account">
        <Initial name={profile.displayName} background={tokens.color.gold} color={theme.color.text} />
        <View style={styles.meText}>
          <Text style={styles.meName}>{profile.displayName}</Text>
          <Text style={styles.meMeta}>
            {session.session?.user.email ?? ""} · {role}
          </Text>
        </View>
      </View>

      <List>
        <ListRow
          title="What's New"
          subtitle="Small updates, in plain words"
          onPress={() => router.push("/whats-new")}
          testID="settings-whats-new"
        />
      </List>

      <Text accessibilityRole="header" style={[styles.heading, display ? { fontFamily: display } : null]}>
        Account
      </Text>
      <List>
        <ListRow title="Name" subtitle={profile.displayName} onPress={() => router.push("/profile")} testID="settings-edit-profile" />
        <ListRow title="Email" subtitle={session.session?.user.email ?? ""} />
        {profile.role === "owner" ? <PetsRow /> : null}
      </List>

      <Text accessibilityRole="header" style={[styles.heading, display ? { fontFamily: display } : null]}>
        Notifications
      </Text>
      <List testID="settings-notifications">
        <ListRow title="Trip updates" subtitle="On the way, arrived" switchValue={tripUpdates} onSwitchChange={setTripUpdates} />
        <ListRow title="Daily notes and photos" switchValue={dailyNotes} onSwitchChange={setDailyNotes} />
        <ListRow title="Tips and news" switchValue={tips} onSwitchChange={setTips} />
      </List>

      <List>
        <ListRow title="Privacy" onPress={() => router.push("/privacy")} testID="settings-privacy" />
        <ListRow title="Sign out" tone="danger" onPress={() => setConfirmLogOut(true)} testID="settings-log-out" />
      </List>
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
    content: { gap: 12, paddingBottom: theme.spacing.xl },
    initial: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    initialText: { fontSize: 14, fontWeight: "800" },
    me: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: theme.spacing.md,
      borderRadius: 28,
      backgroundColor: tokens.color.primary,
    },
    meText: { flex: 1, minWidth: 0, gap: 2 },
    meName: { fontSize: 17, lineHeight: 24, fontWeight: "800", color: tokens.color.primaryText },
    meMeta: { fontSize: 12.5, lineHeight: 17.5, color: tokens.color.accent },
    heading: {
      fontSize: 21,
      lineHeight: 21,
      color: theme.color.text,
      ...(theme.fontFamily.display ? null : { fontWeight: theme.fontWeight.bold }),
    },
    version: { fontSize: 12.5, lineHeight: 17.5, textAlign: "center", color: theme.color.textMuted },
  });
