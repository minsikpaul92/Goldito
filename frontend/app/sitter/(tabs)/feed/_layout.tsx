import { Stack } from "expo-router";

import { HeaderActions } from "../../../../components/HeaderActions";
import { headerOptions, tabTitle } from "../../../../components/RoleTabs";
import { useTheme } from "../../../../providers/ThemeProvider";

/** Feed tab stack — pet list → pet album keeps the bottom tabs (D47b). */
export default function SitterFeedStackLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        ...headerOptions(theme),
        contentStyle: { backgroundColor: theme.color.background },
        headerRight: () => <HeaderActions />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "Moments", headerTitle: tabTitle("Moments"), headerBackVisible: false, headerLeft: () => null }}
      />
      <Stack.Screen name="[petId]" options={{ title: "Pet" }} />
    </Stack>
  );
}
