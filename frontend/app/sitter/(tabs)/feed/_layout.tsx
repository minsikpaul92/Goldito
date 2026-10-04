import { Stack } from "expo-router";

import { HeaderActions } from "../../../../components/HeaderActions";
import { useTheme } from "../../../../providers/ThemeProvider";

/** Feed tab stack — pet list → pet album keeps the bottom tabs (D47b). */
export default function SitterFeedStackLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.color.surface },
        headerTintColor: theme.color.primary,
        headerTitleStyle: {
          color: theme.color.text,
          fontSize: theme.fontSize.body,
          fontWeight: "600",
        },
        contentStyle: { backgroundColor: theme.color.background },
        headerRight: () => <HeaderActions />,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Feed" }} />
      <Stack.Screen name="[petId]" options={{ title: "Pet" }} />
    </Stack>
  );
}
