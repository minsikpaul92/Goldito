import { Tabs } from "expo-router";

import { RoleTabs, tabIcon, tabTitle } from "../../../components/RoleTabs";
import { useMyChats } from "../../../features/chat/useMyChats";

/** Sitter tabs (#329, Seulgi's five tabs): Home · Bookings · Chat · Feed (Photos · Diary) · Snap (treat check · mood · sticker). */
export default function SitterTabsLayout() {
  const { unread } = useMyChats();
  return (
    <RoleTabs>
      <Tabs.Screen name="index" options={{ title: "Home", headerTitle: tabTitle("Today"), tabBarIcon: tabIcon("home") }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: "Bookings", tabBarIcon: tabIcon("calendar") }}
      />
      <Tabs.Screen name="chat" options={{ title: "Chat", tabBarIcon: tabIcon("chats"), tabBarBadge: unread > 0 ? unread : undefined }} />
      <Tabs.Screen
        name="feed"
        options={{ title: "Moments", headerShown: false, tabBarIcon: tabIcon("feed") }}
      />
      <Tabs.Screen name="snap" options={{ title: "Snap", tabBarIcon: tabIcon("camera") }} />
    </RoleTabs>
  );
}
