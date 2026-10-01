import { Redirect } from "expo-router";
import { StyleSheet, View } from "react-native";

import { EmptyState } from "../components/ui/EmptyState";
import { LoadingView } from "../components/ui/LoadingView";
import { TextButton } from "../components/ui/TextButton";
import { homeFor, useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** "/" decides where to go: sign in, or the signed-in role's home (phase-03 3.3). */
export default function Index() {
  const session = useSession();

  if (session.status === "loading") return <LoadingView />;
  if (session.status === "error") return <ProfileError />;
  if (session.status === "signedIn") return <Redirect href={homeFor(session.profile.role)} />;
  return <Redirect href="/login" />;
}

function ProfileError() {
  const styles = useThemedStyles(makeStyles);
  const { error, reload, signOut } = useSession();

  return (
    <View style={styles.container}>
      <EmptyState
        emoji="🐾"
        title={error ?? "Something went wrong."}
        message="Check your connection and try again, or log out and sign in again."
        action={{ label: "Try again", onPress: reload }}
      />
      <TextButton label="Log out" onPress={() => void signOut()} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      padding: theme.spacing.md,
      backgroundColor: theme.color.background,
    },
  });
