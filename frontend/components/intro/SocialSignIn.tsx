import { StyleSheet, View } from "react-native";

import { OrDivider } from "./OrDivider";
import { Button } from "../ui/Button";
import { AppleLogo, GoogleLogo } from "../ui/SocialIcons";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";

/**
 * Apple and Google sign-in aren't connected yet, so the buttons stay out of every build until they work (#362; the
 * intro audit: a judge must never tap a dead button). Set EXPO_PUBLIC_SOCIAL_SIGN_IN=1 to see where they go.
 */
export const isSocialSignInShown = process.env.EXPO_PUBLIC_SOCIAL_SIGN_IN === "1";

type Props = {
  /** The divider under the buttons, when email follows ("or with email"). */
  divider?: string;
  testID?: string;
};

/** Continue with Apple / Google, the same on Welcome, Sign up and Log in. Renders nothing while it's off. */
export function SocialSignIn({ divider, testID = "social" }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  if (!isSocialSignInShown) return null;
  return (
    <View style={styles.wrap}>
      <Button
        label="Continue with Apple"
        variant="secondary"
        icon={<AppleLogo size={20} color={theme.color.text} />}
        onPress={() => toast.show("Coming soon")}
        testID={`${testID}-apple`}
      />
      <Button
        label="Continue with Google"
        variant="secondary"
        icon={<GoogleLogo size={20} />}
        onPress={() => toast.show("Coming soon")}
        testID={`${testID}-google`}
      />
      {divider ? <OrDivider label={divider} /> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({ wrap: { gap: theme.spacing.sm } });
