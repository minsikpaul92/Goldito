import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppShell } from "../components/shell/AppShell";
import { MediaPickerProvider } from "../providers/MediaPickerProvider";
import { NotificationsProvider } from "../providers/NotificationsProvider";
import { SessionProvider } from "../providers/SessionProvider";
import { TripProvider } from "../providers/TripProvider";
import { ErrorDialogProvider } from "../providers/ErrorDialogProvider";
import { ThemeProvider } from "../providers/ThemeProvider";
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
                    {/* Role areas draw their own headers; only shared screens use this stack header. */}
                    <Stack screenOptions={{ headerShown: false, headerShadowVisible: false }}>
                      <Stack.Screen name="profile" options={{ headerShown: true, title: "Profile" }} />
                      <Stack.Screen name="settings" options={{ headerShown: false }} />
                      <Stack.Screen name="sitter-onboarding" options={{ headerShown: true, title: "Your answers" }} />
                      <Stack.Screen name="whats-new" options={{ headerShown: false }} />
                      <Stack.Screen name="chat/[threadId]" options={{ headerShown: true, title: "Chat" }} />
                      <Stack.Screen name="privacy" options={{ headerShown: true, title: "Privacy" }} />
                      <Stack.Screen name="dev/gestures" options={{ headerShown: true, title: "Gesture lab" }} />
                      <Stack.Screen name="dev/health" options={{ headerShown: true, title: "API health" }} />
                    </Stack>
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
