import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppShell } from "../components/shell/AppShell";

export default function RootLayout() {
  // AppShell stays outside every provider: on desktop the outer page renders only the phone frame.
  return (
    <AppShell>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTitle: "PawNote",
          headerShadowVisible: false,
        }}
      />
    </AppShell>
  );
}
