import { Redirect, router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { BackLink } from "../components/ui/BackLink";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingView } from "../components/ui/LoadingView";
import { Screen } from "../components/ui/Screen";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import changelog from "../features/settings/changelog.json";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Release = { version: string; title: string | null; sections: { heading: string; items: string[] }[] };

const RELEASES = changelog as Release[];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-15" → "Oct 15"; anything else (Unreleased, a build name) as written. */
function releaseLabel(release: Release): string {
  const date = release.title?.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (date) return `${MONTHS[Number(date[1]) - 1]} ${Number(date[2])}`;
  return release.title ?? release.version;
}

/** "Photo request: an owner asks…" → the lead in bold, the rest regular. No colon early on = all regular. */
function splitLead(item: string): { lead: string; rest: string } {
  const at = item.indexOf(": ");
  return at > 0 && at < 60 ? { lead: item.slice(0, at + 1), rest: item.slice(at + 1) } : { lead: "", rest: item };
}

/**
 * What's new: small updates in plain words. docs/CHANGELOG.md, turned into JSON by `node scripts/changelog.mjs`
 * (CI checks they match). The newest entry sits on a butter block.
 */
export default function WhatsNewScreen() {
  const styles = useThemedStyles(makeStyles);
  const session = useSession();
  if (session.status === "loading") return <LoadingView />;
  if (session.status !== "signedIn") return <Redirect href="/welcome" />;

  return (
    <Screen contentStyle={styles.content} testID="whats-new">
      <BackLink onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} testID="whats-new-back" />
      <ScreenHeader title="What's New" subtitle="Small updates, in plain words" />
      {RELEASES.length === 0 ? (
        <EmptyState emoji="✨" title="Nothing new yet" message="New features show here." />
      ) : (
        RELEASES.map((release, i) => (
          <Card key={release.version} tone={i === 0 ? "butter" : undefined} style={styles.release} testID={`release-${release.version}`}>
            <Text style={styles.label}>{i === 0 ? `${releaseLabel(release)} · New` : releaseLabel(release)}</Text>
            <View style={styles.items}>
              {release.sections
                .flatMap((section) => section.items)
                .map((item) => {
                  const { lead, rest } = splitLead(item);
                  return (
                    <Text key={item} style={styles.item}>
                      {lead ? <Text style={styles.lead}>{lead}</Text> : null}
                      {rest}
                    </Text>
                  );
                })}
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: 12, paddingBottom: theme.spacing.xl },
    release: { gap: theme.spacing.sm, padding: 18, borderRadius: 28 },
    label: {
      fontSize: 11.5,
      lineHeight: 11.5,
      fontWeight: "800",
      letterSpacing: 0.92,
      textTransform: "uppercase",
      color: theme.color.textMuted,
    },
    items: { gap: 6, paddingLeft: 18 },
    item: { fontSize: theme.fontSize.small, lineHeight: 20.3, color: theme.color.text },
    lead: { fontWeight: "800" },
  });
