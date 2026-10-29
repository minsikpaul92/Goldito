import { Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingView } from "../components/ui/LoadingView";
import { Screen } from "../components/ui/Screen";
import { ScreenSubtitle } from "../components/ui/ScreenHeader";
import changelog from "../features/settings/changelog.json";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { tokens } from "../theme/tokens";

type Release = { version: string; title: string | null; sections: { heading: string; items: string[] }[] };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-15" → "Oct 15". Null when the heading has no date. */
function releaseDate(release: Release): string | null {
  const date = release.title?.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return date ? `${MONTHS[Number(date[1]) - 1]} ${Number(date[2])}` : null;
}

// One card per dated heading in docs/CHANGELOG.md; a heading with no date (the hackathon scaffold) stays out.
const RELEASES = (changelog as Release[]).filter((release) => releaseDate(release) !== null);

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
      <ScreenSubtitle>Small updates, in plain words</ScreenSubtitle>
      {RELEASES.length === 0 ? (
        <EmptyState icon="whatsNew" title="Nothing new yet" message="New features show here." />
      ) : (
        RELEASES.map((release, i) => (
          <Card key={`${release.version}-${release.title}`} tone={i === 0 ? "butter" : undefined} style={styles.release} testID={`release-${i}`}>
            {i === 0 ? (
              <View style={styles.newPill}>
                <Text style={styles.newPillLabel}>New</Text>
              </View>
            ) : null}
            <Text style={styles.label}>{releaseDate(release)}</Text>
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
    newPill: { alignSelf: "flex-start", backgroundColor: tokens.color.gold, borderRadius: theme.ui.radius.tag, paddingHorizontal: 9, paddingVertical: 2 },
    newPillLabel: { fontSize: 11.5, lineHeight: 16, fontWeight: "800", color: theme.color.text },
    items: { gap: 6, paddingLeft: 18 },
    item: { fontSize: theme.fontSize.small, lineHeight: 20.3, color: theme.color.text },
    lead: { fontWeight: "800" },
  });
