import Constants from "expo-constants";
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "../components/ui/Avatar";
import { List, ListRow } from "../components/ui/ListRow";
import { LoadingView } from "../components/ui/LoadingView";
import { Screen } from "../components/ui/Screen";
import { useMyPets } from "../features/pets/useMyPets";
import { loadCoverPhoto, photoThumb } from "../features/profile/profilePhotosApi";
import { useNotificationPrefs } from "../features/settings/notificationPrefs";
import { useSession } from "../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { tokens } from "../theme/tokens";
import { usePlayfulWords } from "../features/settings/playfulWords";

/** The person's cover photo on a round ground, or their first letter when they have none (Figma: the green block). */
function Face({ profileId, name, background, color }: { profileId: string; name: string; background: string; color: string }) {
  const styles = useThemedStyles(makeStyles);
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadCoverPhoto(profileId)
      .then((cover) => active && cover && setUri(photoThumb(cover, 120)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [profileId]);

  if (uri) return <Avatar kind="photo" uri={uri} size={40} />;
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
  const { prefs, setPref } = useNotificationPrefs();
  const [playful, setPlayful] = usePlayfulWords();
  if (session.status === "loading") return <LoadingView />;
  if (session.status !== "signedIn") return <Redirect href="/welcome" />;
  const { profile } = session;
  const version = Constants.expoConfig?.version ?? "dev";
  const role = profile.role === "owner" ? "Owner" : "Sitter";
  const display = theme.fontFamily.display;

  return (
    <Screen contentStyle={styles.content} testID="settings">
      <View style={styles.me} testID="settings-account">
        <Face profileId={profile.id} name={profile.displayName} background={tokens.color.gold} color={theme.color.text} />
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
        <ListRow title="Trip updates" subtitle="On the way, arrived" switchValue={prefs.trip} onSwitchChange={(on) => void setPref("trip", on)} />
        <ListRow title="Diary pages and photos" switchValue={prefs.daily} onSwitchChange={(on) => void setPref("daily", on)} />
        <ListRow title="Tips and news" switchValue={prefs.tips} onSwitchChange={(on) => void setPref("tips", on)} />
      </List>

      <Text accessibilityRole="header" style={[styles.heading, display ? { fontFamily: display } : null]}>
        Words
      </Text>
      <List>
        <ListRow
          title="Playful words"
          subtitle="Little puns in toasts and empty states. Safety, money and agreements always stay plain."
          switchValue={playful}
          onSwitchChange={setPlayful}
          testID="settings-playful"
        />
      </List>

      <List>
        <ListRow title="Terms of Service" onPress={() => router.push("/terms")} testID="settings-terms" />
        <ListRow title="Privacy" onPress={() => router.push("/privacy")} testID="settings-privacy" />
        <ListRow title="Log out" tone="danger" onPress={() => void session.signOut()} testID="settings-log-out" />
      </List>
      <Text style={styles.version} testID="settings-version">
        Goldito {version}
      </Text>

    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
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
