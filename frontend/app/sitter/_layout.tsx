import { Tabs } from "expo-router";

import { RoleTabs, tabIcon } from "../../components/RoleTabs";

export default function SitterLayout() {
  return (
    <RoleTabs role="sitter">
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: tabIcon("sunny-outline") }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks", tabBarIcon: tabIcon("checkbox-outline") }} />
      <Tabs.Screen name="scan" options={{ title: "Scan", tabBarIcon: tabIcon("scan-outline") }} />
      <Tabs.Screen name="report" options={{ title: "Report", tabBarIcon: tabIcon("create-outline") }} />
    </RoleTabs>
  );
}
