import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Screen } from "../components/ui/Screen";
import { getApiBaseUrl, getHealth } from "../lib/api";
import { tokens } from "../theme/tokens";

export default function HomeScreen() {
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
      <Text style={styles.title}>PawNote</Text>
      <Text style={styles.subtitle}>
        Private care updates for dogs and cats — development build
      </Text>

      <Card style={styles.card}>
        <Text style={styles.label}>Backend</Text>
        <Text style={styles.url}>{apiUrl ?? "(EXPO_PUBLIC_API_URL not set)"}</Text>
        <Button label="Check API" onPress={onCheckApi} disabled={loading} style={styles.button} />
        {loading ? <ActivityIndicator style={styles.spinner} color={tokens.color.primary} /> : null}
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

const styles = StyleSheet.create({
  title: {
    fontSize: tokens.fontSize.title,
    fontWeight: "700",
    color: tokens.color.text,
    marginBottom: tokens.spacing.xs,
  },
  subtitle: {
    fontSize: tokens.fontSize.small,
    color: tokens.color.textMuted,
    marginBottom: tokens.spacing.lg,
  },
  card: {
    gap: tokens.spacing.sm,
  },
  label: {
    fontSize: tokens.fontSize.small,
    fontWeight: "600",
    color: tokens.color.textMuted,
    textTransform: "uppercase",
  },
  url: {
    fontSize: tokens.fontSize.small,
    color: tokens.color.text,
  },
  button: {
    marginTop: tokens.spacing.sm,
  },
  spinner: {
    marginTop: tokens.spacing.sm,
  },
  status: {
    marginTop: tokens.spacing.sm,
    fontSize: tokens.fontSize.body,
  },
  statusOk: {
    color: tokens.color.success,
  },
  statusErr: {
    color: tokens.color.error,
  },
});
