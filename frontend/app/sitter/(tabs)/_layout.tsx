import { Tabs } from "expo-router";

import { RoleTabs, tabIcon } from "../../../components/RoleTabs";

// Treat scanner is not a tab: it opens from a Today button in Phase 08 (architecture §3).
export default function SitterTabsLayout() {
  return (
    <RoleTabs>
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: tabIcon("sunny-outline") }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: "Bookings", tabBarIcon: tabIcon("calendar-outline") }}
      />
      <Tabs.Screen name="tasks" options={{ title: "Tasks", tabBarIcon: tabIcon("checkbox-outline") }} />
      <Tabs.Screen name="report" options={{ title: "Report", tabBarIcon: tabIcon("create-outline") }} />
    </RoleTabs>
  );
}
