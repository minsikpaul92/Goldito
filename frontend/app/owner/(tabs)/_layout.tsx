import { Tabs } from "expo-router";

import { RoleTabs, tabIcon } from "../../../components/RoleTabs";

/** Owner tabs — D47: Home · Bookings · Feed · Diary · Mood. Settings = header Profile. */
export default function OwnerTabsLayout() {
  return (
    <RoleTabs>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("home-outline") }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: "Bookings", tabBarIcon: tabIcon("calendar-outline") }}
      />
      <Tabs.Screen name="feed" options={{ title: "Feed", tabBarIcon: tabIcon("images-outline") }} />
      <Tabs.Screen name="diary" options={{ title: "Diary", tabBarIcon: tabIcon("book-outline") }} />
      <Tabs.Screen name="mood" options={{ title: "Mood", tabBarIcon: tabIcon("happy-outline") }} />
    </RoleTabs>
  );
}
