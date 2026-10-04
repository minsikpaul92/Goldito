import { Tabs } from "expo-router";

import { RoleTabs, tabIcon } from "../../../components/RoleTabs";

/** Sitter tabs — D47b: Home · Bookings · Feed · Diary · Mood. Scan = Home button (08). */
export default function SitterTabsLayout() {
  return (
    <RoleTabs>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("home-outline") }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: "Bookings", tabBarIcon: tabIcon("calendar-outline") }}
      />
      <Tabs.Screen
        name="feed"
        options={{ title: "Feed", headerShown: false, tabBarIcon: tabIcon("images-outline") }}
      />
      <Tabs.Screen name="diary" options={{ title: "Diary", tabBarIcon: tabIcon("book-outline") }} />
      <Tabs.Screen name="mood" options={{ title: "Mood", tabBarIcon: tabIcon("happy-outline") }} />
    </RoleTabs>
  );
}
