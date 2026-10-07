import { Stack } from "expo-router";

import { RoleStack } from "../../components/RoleTabs";

// A direct link or refresh on a detail screen still has the tabs underneath, so Back works.
export const unstable_settings = { initialRouteName: "(tabs)" };

export default function SitterLayout() {
  return (
    <RoleStack role="sitter">
      <Stack.Screen name="schedule" options={{ title: "Schedule" }} />
      <Stack.Screen name="bookings/[bookingId]" options={{ title: "Booking" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="tasks" options={{ title: "Today's tasks" }} />
      <Stack.Screen name="checkin/[petId]" options={{ title: "Check-in" }} />
      <Stack.Screen name="care-request/[requestId]" options={{ title: "Care request" }} />
      <Stack.Screen name="inquiries/[inquiryId]" options={{ title: "Question" }} />
      <Stack.Screen name="history" options={{ title: "My history" }} />
    </RoleStack>
  );
}
