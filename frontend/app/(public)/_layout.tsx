import { Redirect, Stack } from "expo-router";

import { BootView } from "../../components/intro/BootView";
import { useSession } from "../../providers/SessionProvider";

/** Signed-in users skip Welcome — "/" sends them to their role home. */
export default function PublicLayout() {
  const { status } = useSession();

  if (status === "loading") return <BootView />;
  if (status === "signedIn" || status === "error") return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
