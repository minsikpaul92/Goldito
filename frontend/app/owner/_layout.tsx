import { Redirect, Stack } from "expo-router";
import { useEffect, useState } from "react";

import { RoleStack } from "../../components/RoleTabs";
import { needsOwnerOnboarding } from "../../features/ownerOnboarding/ownerOnboardingApi";
import { useSession } from "../../providers/SessionProvider";

// A direct link or refresh on a detail screen still has the tabs underneath, so Back works.
export const unstable_settings = { initialRouteName: "(tabs)" };

/** A new owner (owner_profiles.onboarded_at is null, 014v) is sent to the sign-up questions first. */
function OnboardingGate() {
  const session = useSession();
  const userId = session.status === "signedIn" && session.profile.role === "owner" ? session.profile.id : null;
  const [needs, setNeeds] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    needsOwnerOnboarding(userId)
      .then((n) => active && setNeeds(n))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  return needs ? <Redirect href="/owner-onboarding" /> : null;
}

export default function OwnerLayout() {
  return (
    <>
      <OnboardingGate />
      <RoleStack role="owner">
        <Stack.Screen name="pets/new" options={{ title: "Add a pet" }} />
        <Stack.Screen name="pets/[petId]" options={{ title: "Pet profile" }} />
        <Stack.Screen name="pets/[petId]/record" options={{ title: "Life Record" }} />
        <Stack.Screen name="pets/[petId]/personality" options={{ title: "Personality" }} />
        <Stack.Screen name="pets/[petId]/care-request" options={{ title: "Care request" }} />
        <Stack.Screen name="sitters/[sitterId]/index" options={{ title: "Sitter" }} />
        <Stack.Screen name="sitters/[sitterId]/calendar" options={{ title: "Calendar" }} />
        <Stack.Screen name="bookings/new" options={{ title: "Book care" }} />
        <Stack.Screen name="bookings/[bookingId]/index" options={{ title: "Booking details" }} />
        <Stack.Screen name="bookings/[bookingId]/trip" options={{ title: "Trip" }} />
        <Stack.Screen name="bookings/[bookingId]/checkout" options={{ title: "Checkout" }} />
        <Stack.Screen name="bookings/[bookingId]/review" options={{ title: "Review" }} />
        <Stack.Screen name="home-access" options={{ title: "Entry info" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="diary/[entryId]" options={{ title: "Diary" }} />
        <Stack.Screen name="diary/index" options={{ headerShown: false }} />
        <Stack.Screen name="history" options={{ title: "History" }} />
        <Stack.Screen name="snap/treat" options={{ title: "Treat check" }} />
        <Stack.Screen name="snap/checks" options={{ title: "Recent checks" }} />
        <Stack.Screen name="snap/mood" options={{ title: "Mood" }} />
        <Stack.Screen name="snap/sticker" options={{ title: "Sticker" }} />
      </RoleStack>
    </>
  );
}
