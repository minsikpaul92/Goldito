import { Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingView } from "../components/ui/LoadingView";
import { Screen } from "../components/ui/Screen";
import changelog from "../features/settings/changelog.json";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Release = { version: string; title: string | null; sections: { heading: string; items: string[] }[] };

const RELEASES = changelog as Release[];

/**
 * What's new: what people can now do that they could not at launch. docs/CHANGELOG.md, turned into JSON by
 * `node scripts/changelog.mjs` (CI checks they match); only releases from 1.0.0 on are shown, never the build-up to launch.
 */
export default function WhatsNewScreen() {
  const styles = useThemedStyles(makeStyles);
  const session = useSession();
  if (session.status === "loading") return <LoadingView />;
  if (session.status !== "signedIn") return <Redirect href="/welcome" />;

  return (
    <Screen contentStyle={styles.content} testID="whats-new">
      {RELEASES.length === 0 ? (
        <EmptyState emoji="✨" title="Nothing new yet" message="New features show here." />
      ) : (
        RELEASES.map((release) => (
          <Card key={release.version} testID={`release-${release.version}`}>
            <Text style={styles.release}>
              {release.version}
              {release.title ? ` · ${release.title}` : ""}
            </Text>
            {release.sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={styles.sectionHeading}>{section.heading}</Text>
                {section.items.map((item) => (
                  <Text key={item} style={styles.item}>
                    • {item}
                  </Text>
                ))}
              </View>
            ))}
          </Card>
        ))
      )}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
    release: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    section: { gap: theme.spacing.xs, marginTop: theme.spacing.sm },
    sectionHeading: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.textMuted },
    item: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },
  });
