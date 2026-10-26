import { Redirect } from "expo-router";

/** Add pet is the sign-up questions for one pet (#367). An old link here goes there, never to a pet called "new". */
export default function AddPetScreen() {
  return <Redirect href="/owner-onboarding?add=1" />;
}
