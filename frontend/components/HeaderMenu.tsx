import { router } from "expo-router";
import { ComponentProps, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, IconName } from "./ui/Icon";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { ProfileAvatar } from "./ProfileAvatar";
import { useNotifications } from "../providers/NotificationsProvider";
import { useSession } from "../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const DURATION = 260;

/** Header ≡ (#147): a full-width drawer from the right. You → Profile, Notifications, Schedule (sitters), What's new, Settings, Sign out. */
export function HeaderMenu() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { profile, signOut } = useSession();
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!open) return;
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: DURATION, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [open, slide]);

  // Slides back out, then unmounts; `then` runs after (e.g. navigate).
  const close = (then?: () => void) => {
    Animated.timing(slide, { toValue: 0, duration: DURATION - 60, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setOpen(false);
      setConfirming(false);
      then?.();
    });
  };
  const go = (href: Parameters<typeof router.push>[0]) => close(() => router.push(href));

  const name = profile?.displayName || "You";
  const role = profile?.role === "sitter" ? "Sitter" : "Owner";
  const notificationsHref = profile?.role === "sitter" ? "/sitter/notifications" : "/owner/notifications";

  const row = (icon: IconName, label: string, onPress: () => void, testID: string, right?: React.ReactNode) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={testID}
    >
      <Icon name={icon} size={24} color={theme.color.primary} />
      <Text style={styles.rowLabel}>{label}</Text>
      {right ?? <Icon name="forward" size={18} color={theme.color.textMuted} />}
    </Pressable>
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Menu"
        onPress={() => setOpen(true)}
        style={styles.iconButton}
        testID="open-menu"
      >
        <Icon name="menu" size={24} color={theme.color.text} />
      </Pressable>
      <Modal visible={open} transparent animationType="none" onRequestClose={() => close()}>
        <Animated.View style={[styles.scrim, { opacity: slide }]} />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.drawer,
            { paddingTop: insets.top + theme.spacing.sm, paddingBottom: insets.bottom + theme.spacing.md },
            { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }] },
          ]}
          testID="header-menu"
        >
          <View style={styles.top}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={() => close()}
              style={styles.iconButton}
              testID="header-menu-close"
            >
              <Icon name="close" size={26} color={theme.color.text} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${role}. Profile`}
            onPress={() => go("/profile")}
            style={({ pressed }) => [styles.you, pressed && styles.pressed]}
            testID="open-profile"
          >
            {profile ? (
              <ProfileAvatar profileId={profile.id} name={name} size={56} testID="menu-avatar" />
            ) : (
              <Avatar kind="initial" name={name} size={56} />
            )}
            <View style={styles.youText}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Text style={styles.muted}>{role}</Text>
            </View>
            <Icon name="forward" size={18} color={theme.color.textMuted} />
          </Pressable>

          {confirming ? (
            <View style={styles.confirm}>
              <Text style={styles.name}>Sign out?</Text>
              <Button label="Sign out" variant="danger" onPress={() => close(() => void signOut())} testID="log-out-confirm" />
              <Button label="Cancel" variant="secondary" onPress={() => setConfirming(false)} testID="log-out-cancel" />
            </View>
          ) : (
            <>
              <View style={styles.list}>
                {row(
                  "bell",
                  "Notifications",
                  () => go(notificationsHref),
                  "menu-notifications",
                  unreadCount > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                    </View>
                  ) : undefined,
                )}
                {profile?.role === "sitter" ? row("calendar", "Schedule", () => go("/sitter/schedule"), "open-schedule") : null}
                {row("whatsNew", "What's new", () => go("/whats-new"), "menu-whats-new")}
                {row("settings", "Settings", () => go("/settings"), "open-settings")}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirming(true)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                testID="log-out"
              >
                <Icon name="logOut" size={24} color={theme.color.textMuted} />
                <Text style={[styles.rowLabel, styles.mutedLabel]}>Sign out</Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </Modal>
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    iconButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.color.overlay },
    drawer: {
      position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
      backgroundColor: theme.color.background,
      paddingHorizontal: theme.spacing.md,
    },
    top: { flexDirection: "row", justifyContent: "flex-end" },
    you: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    youText: { flex: 1, minWidth: 0, gap: 2 },
    name: { fontSize: 20, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    list: { flex: 1, paddingTop: theme.spacing.sm },
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minHeight: 56 },
    pressed: { opacity: theme.motion.pressOpacity },
    rowLabel: { flex: 1, fontSize: 18, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    mutedLabel: { color: theme.color.textMuted },
    badge: {
      minWidth: 28,
      height: 24,
      paddingHorizontal: 8,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.error,
    },
    badgeText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.onMedia },
    confirm: { flex: 1, justifyContent: "flex-end", gap: theme.spacing.sm },
  });
