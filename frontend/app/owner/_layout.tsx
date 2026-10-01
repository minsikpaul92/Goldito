import { Stack } from "expo-router";

import { RoleStack } from "../../components/RoleTabs";

// A direct link or refresh on a detail screen still has the tabs underneath, so Back works.
export const unstable_settings = { initialRouteName: "(tabs)" };

export default function OwnerLayout() {
  return (
    <RoleStack role="owner">
      <Stack.Screen name="pets/new" options={{ title: "Add a pet" }} />
      <Stack.Screen name="pets/[petId]" options={{ title: "Pet profile" }} />
    </RoleStack>
  );
}
