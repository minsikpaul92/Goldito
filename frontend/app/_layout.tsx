import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";

import { AppShell } from "../components/shell/AppShell";
import { JudgeBridge } from "../components/shell/JudgeBridge";
import { MediaPickerProvider } from "../providers/MediaPickerProvider";
import { NotificationsProvider } from "../providers/NotificationsProvider";
import { SessionProvider } from "../providers/SessionProvider";
import { TripProvider } from "../providers/TripProvider";
import { ErrorDialogProvider } from "../providers/ErrorDialogProvider";
import { headerOptions } from "../components/RoleTabs";
import { ThemeProvider, useTheme } from "../providers/ThemeProvider";
import { ToastProvider } from "../providers/ToastProvider";

// Opening /profile directly still has "/" underneath, so Back returns to the app.
export const unstable_settings = { initialRouteName: "index" };

export default function RootLayout() {
  // AppShell stays outside every provider: on desktop the outer page renders only the phone frame.
  return (
    <AppShell>
      <ThemeProvider>
        <SessionProvider>
          <ToastProvider>
            <ErrorDialogProvider>
              <NotificationsProvider>
                <TripProvider>
                  <MediaPickerProvider>
                    <StatusBar style="dark" />
                    <JudgeBridge />
                    {/* Role areas draw their own headers; only shared screens use this stack header. */}
                    <RootStack />
                  </MediaPickerProvider>
                </TripProvider>
              </NotificationsProvider>
            </ErrorDialogProvider>
          </ToastProvider>
        </SessionProvider>
      </ThemeProvider>
    </AppShell>
  );
}

/** Shared screens (profile, settings, chat, ...) get the same header as the role stacks. */
function RootStack() {
  const theme = useTheme();

  // Keyboard focus ring colour for public/index.html's :focus-visible rule.
  useEffect(() => {
    if (Platform.OS === "web") document.documentElement.style.setProperty("--focus-ring", theme.color.primary);
  }, [theme.color.primary]);

  return (
    <Stack
      screenOptions={{
        ...headerOptions(theme),
        headerShown: false,
        contentStyle: { backgroundColor: theme.color.background },
      }}
    >
      <Stack.Screen name="profile" options={{ headerShown: true, title: "Profile" }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="sitter-onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="whats-new" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[threadId]" options={{ headerShown: true, title: "Chat" }} />
      <Stack.Screen name="privacy" options={{ headerShown: false }} />
      <Stack.Screen name="terms" options={{ headerShown: false }} />
      <Stack.Screen name="dev/gestures" options={{ headerShown: true, title: "Gesture lab" }} />
      <Stack.Screen name="dev/health" options={{ headerShown: true, title: "API health" }} />
      <Stack.Screen name="dev/kit" options={{ headerShown: true, title: "Design kit" }} />
      <Stack.Screen name="dev/booking-flow" options={{ headerShown: false }} />
    </Stack>
  );
}
