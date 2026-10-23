import { Tabs } from "expo-router";

import { RoleTabs, tabIcon, tabTitle } from "../../../components/RoleTabs";

/** Sitter tabs — D47b · D61: Home · Bookings · Feed · Diary · Snap (treat check · mood · sticker). */
export default function SitterTabsLayout() {
  return (
    <RoleTabs>
      <Tabs.Screen name="index" options={{ title: "Home", headerTitle: tabTitle("Today"), tabBarIcon: tabIcon("home") }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: "Bookings", tabBarIcon: tabIcon("calendar") }}
      />
      <Tabs.Screen
        name="feed"
        options={{ title: "Feed", headerShown: false, tabBarIcon: tabIcon("feed") }}
      />
      <Tabs.Screen name="diary" options={{ title: "Diary", tabBarIcon: tabIcon("diary") }} />
      <Tabs.Screen name="snap" options={{ title: "Snap", tabBarIcon: tabIcon("camera") }} />
    </RoleTabs>
  );
}
