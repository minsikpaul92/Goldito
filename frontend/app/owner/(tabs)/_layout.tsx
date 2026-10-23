import { Tabs } from "expo-router";

import { RoleTabs, tabIcon } from "../../../components/RoleTabs";
import { useMyChats } from "../../../features/chat/useMyChats";

/** Owner tabs (#329, Seulgi's five tabs): Home · Bookings · Chat · Feed (Photos · Diary) · Snap. Settings = header menu. */
export default function OwnerTabsLayout() {
  const { unread } = useMyChats();
  return (
    <RoleTabs>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("home") }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: "Bookings", tabBarIcon: tabIcon("calendar") }}
      />
      <Tabs.Screen name="chat" options={{ title: "Chat", tabBarIcon: tabIcon("chats"), tabBarBadge: unread > 0 ? unread : undefined }} />
      <Tabs.Screen name="feed" options={{ title: "Feed", tabBarIcon: tabIcon("feed") }} />
      <Tabs.Screen name="snap" options={{ title: "Snap", tabBarIcon: tabIcon("camera") }} />
    </RoleTabs>
  );
}
