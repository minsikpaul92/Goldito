import { Tabs } from "expo-router";

import { RoleTabs, tabIcon } from "../../../components/RoleTabs";

export default function OwnerTabsLayout() {
  return (
    <RoleTabs>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("home-outline") }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: "Bookings", tabBarIcon: tabIcon("calendar-outline") }}
      />
      <Tabs.Screen name="feed" options={{ title: "Feed", tabBarIcon: tabIcon("images-outline") }} />
      <Tabs.Screen name="tasks" options={{ title: "Care", tabBarIcon: tabIcon("medkit-outline") }} />
      <Tabs.Screen
        name="reports"
        options={{ title: "Reports", tabBarIcon: tabIcon("document-text-outline") }}
      />
    </RoleTabs>
  );
}
