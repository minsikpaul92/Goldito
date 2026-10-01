import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppShell } from "../components/shell/AppShell";
import { ThemeProvider } from "../providers/ThemeProvider";

export default function RootLayout() {
  // AppShell stays outside every provider: on desktop the outer page renders only the phone frame.
  return (
    <AppShell>
      <ThemeProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTitle: "PawNote",
            headerShadowVisible: false,
          }}
        />
      </ThemeProvider>
    </AppShell>
  );
}
