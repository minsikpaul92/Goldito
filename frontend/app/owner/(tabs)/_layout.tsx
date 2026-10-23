import { Tabs } from "expo-router";

import { RoleTabs, tabIcon } from "../../../components/RoleTabs";

/** Owner tabs — D47 · D61: Home · Bookings · Feed · Diary · Snap. Settings = header Profile. */
export default function OwnerTabsLayout() {
  return (
    <RoleTabs>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("home") }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: "Bookings", tabBarIcon: tabIcon("calendar") }}
      />
      <Tabs.Screen name="feed" options={{ title: "Feed", tabBarIcon: tabIcon("feed") }} />
      <Tabs.Screen name="diary" options={{ title: "Diary", tabBarIcon: tabIcon("diary") }} />
      <Tabs.Screen name="snap" options={{ title: "Snap", tabBarIcon: tabIcon("camera") }} />
    </RoleTabs>
  );
}
