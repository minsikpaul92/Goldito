import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppShell } from "../components/shell/AppShell";
import { SessionProvider } from "../providers/SessionProvider";
import { ThemeProvider } from "../providers/ThemeProvider";

export default function RootLayout() {
  // AppShell stays outside every provider: on desktop the outer page renders only the phone frame.
  return (
    <AppShell>
      <ThemeProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          {/* Role areas draw their own tab headers; only dev screens use this stack header. */}
          <Stack screenOptions={{ headerShown: false, headerShadowVisible: false }}>
            <Stack.Screen name="dev/gestures" options={{ headerShown: true, title: "Gesture lab" }} />
            <Stack.Screen name="dev/health" options={{ headerShown: true, title: "API health" }} />
          </Stack>
        </SessionProvider>
      </ThemeProvider>
    </AppShell>
  );
}
