import { Redirect } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { getApiBaseUrl, getHealth } from "../../lib/api";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** Backend health check (task 1.3), moved off "/" when "/" became the sign-in gate (3.3). */
const devRoutesEnabled = process.env.EXPO_PUBLIC_DEV_ROUTES === "1";

export default function ApiHealth() {
  if (!devRoutesEnabled) return <Redirect href="/" />;
  return <ApiHealthScreen />;
}

function ApiHealthScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onCheckApi() {
    setLoading(true);
    setStatusMessage(null);
    const result = await getHealth();
    setStatusMessage(result.message);
    setLoading(false);
  }

  const apiUrl = getApiBaseUrl();

  return (
    <Screen>
      <Text style={styles.title}>Pawddy</Text>
      <Text style={styles.subtitle}>
        Private care updates for dogs and cats — development build
      </Text>

      <Card style={styles.card}>
        <Text style={styles.label}>Backend</Text>
        <Text style={styles.url}>{apiUrl ?? "(EXPO_PUBLIC_API_URL not set)"}</Text>
        <Button label="Check API" onPress={onCheckApi} disabled={loading} style={styles.button} />
        {loading ? <ActivityIndicator style={styles.spinner} color={theme.color.primary} /> : null}
        {statusMessage ? (
          <Text
            style={[
              styles.status,
              statusMessage.includes("OK") ? styles.statusOk : styles.statusErr,
            ]}
          >
            {statusMessage}
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    title: {
      fontSize: theme.fontSize.title,
      fontWeight: "700",
      color: theme.color.text,
      marginBottom: theme.spacing.xs,
    },
    subtitle: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      marginBottom: theme.spacing.lg,
    },
    card: {
      gap: theme.spacing.sm,
    },
    label: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.textMuted,
      textTransform: "uppercase",
    },
    url: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    button: {
      marginTop: theme.spacing.sm,
    },
    spinner: {
      marginTop: theme.spacing.sm,
    },
    status: {
      marginTop: theme.spacing.sm,
      fontSize: theme.fontSize.body,
    },
    statusOk: {
      color: theme.color.success,
    },
    statusErr: {
      color: theme.color.error,
    },
  });
