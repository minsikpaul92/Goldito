import { Stack } from "expo-router";

import { RoleStack } from "../../components/RoleTabs";

// A direct link or refresh on a detail screen still has the tabs underneath, so Back works.
export const unstable_settings = { initialRouteName: "(tabs)" };

export default function OwnerLayout() {
  return (
    <RoleStack role="owner">
      <Stack.Screen name="pets/new" options={{ title: "Add a pet" }} />
      <Stack.Screen name="pets/[petId]" options={{ title: "Pet profile" }} />
      <Stack.Screen name="pets/[petId]/record" options={{ title: "Life Record" }} />
      <Stack.Screen name="pets/[petId]/care-request" options={{ title: "Care request" }} />
      <Stack.Screen name="sitters/[sitterId]" options={{ title: "Sitter" }} />
      <Stack.Screen name="bookings/new" options={{ title: "Book care" }} />
      <Stack.Screen name="bookings/[bookingId]/index" options={{ title: "Booking" }} />
      <Stack.Screen name="bookings/[bookingId]/checkout" options={{ title: "Checkout" }} />
      <Stack.Screen name="bookings/[bookingId]/review" options={{ title: "Review" }} />
      <Stack.Screen name="home-access" options={{ title: "Entry info" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="diary/[entryId]" options={{ title: "Diary" }} />
      <Stack.Screen name="inquiries/[inquiryId]" options={{ title: "Conversation" }} />
      <Stack.Screen name="history" options={{ title: "History" }} />
    </RoleStack>
  );
}
