import { Redirect, Stack } from "expo-router";
import { useEffect, useState } from "react";

import { RoleStack } from "../../components/RoleTabs";
import { needsOnboarding } from "../../features/onboarding/onboardingApi";
import { useSession } from "../../providers/SessionProvider";

// A direct link or refresh on a detail screen still has the tabs underneath, so Back works.
export const unstable_settings = { initialRouteName: "(tabs)" };

/** A sitter who has not finished onboarding (sitter_profiles.onboarded_at is null, 014f) is sent there first. */
function OnboardingGate() {
  const session = useSession();
  const userId = session.status === "signedIn" && session.profile.role === "sitter" ? session.profile.id : null;
  const [needs, setNeeds] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    needsOnboarding(userId)
      .then((n) => active && setNeeds(n))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  return needs ? <Redirect href="/sitter-onboarding" /> : null;
}

export default function SitterLayout() {
  return (
    <>
      <OnboardingGate />
      <RoleStack role="sitter">
        <Stack.Screen name="schedule" options={{ title: "Schedule" }} />
        <Stack.Screen name="owners/[ownerId]" options={{ title: "Owner" }} />
        <Stack.Screen name="bookings/[bookingId]/index" options={{ title: "Booking details" }} />
        <Stack.Screen name="bookings/[bookingId]/trip" options={{ title: "Trip" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="tasks" options={{ title: "Tasks" }} />
        <Stack.Screen name="diary" options={{ headerShown: false }} />
        <Stack.Screen name="checkin/[petId]" options={{ title: "Check-in" }} />
        <Stack.Screen name="care-request/[requestId]" options={{ title: "Care request" }} />
        <Stack.Screen name="history" options={{ title: "History" }} />
        <Stack.Screen name="snap/treat" options={{ title: "Treat check" }} />
        <Stack.Screen name="snap/checks" options={{ title: "Recent checks" }} />
        <Stack.Screen name="snap/mood" options={{ title: "Mood" }} />
        <Stack.Screen name="snap/sticker" options={{ title: "Sticker" }} />
      </RoleStack>
    </>
  );
}
