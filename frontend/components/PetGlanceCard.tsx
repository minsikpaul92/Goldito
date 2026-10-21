import { Image, Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polygon, Polyline, Text as SvgText } from "react-native-svg";

import { Avatar } from "./ui/Avatar";
import { LinkButton } from "./ui/LinkButton";
import { Card } from "./ui/Card";
import { Tag, TagTone } from "./ui/Tag";
import { BreedNeeds, NEEDS_LABEL } from "../features/ownerOnboarding/breedNeedsApi";
import { AXIS_LABEL, chartAxes } from "../features/ownerOnboarding/questions";
import { PetProfile, glance } from "../features/ownerOnboarding/scoring";
import { petPhotoThumb } from "../features/ownerOnboarding/petPhotosApi";
import { SPECIES_EMOJI } from "../features/pets/petFormat";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import type { Species } from "../types/db";

type Props = {
  name: string;
  species: Species;
  /** "Dog · Maltese · 4 yrs · 6 kg", already put together. */
  facts: string;
  coverPublicId?: string | null;
  profile: PetProfile;
  /** Foods to avoid (the pet's allergies), lowercase. */
  allergens: string[];
  /** What the breed needs, with its sources, when the lookup has an answer. */
  needs?: BreedNeeds | null;
  /** Drawn inside another card: no border or padding of its own. */
  bare?: boolean;
  testID?: string;
};

const WIDTH = 340;
const HEIGHT = 215;
const CENTER_X = WIDTH / 2;
const CENTER_Y = 112;
const RADIUS = 70;
// SVG text does not inherit the page font on the web.
const FONT = Platform.OS === "web" ? "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" : undefined;
const TONE = { warning: "warning", info: "neutral", unsure: "neutral" } as const satisfies Record<string, TagTone>;

/** The point of an axis at a given share (0 to 1) of the radius, the first axis straight up, going clockwise. */
function point(index: number, share: number, count: number): [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return [CENTER_X + RADIUS * share * Math.cos(angle), CENTER_Y + RADIUS * share * Math.sin(angle)];
}

/**
 * "{name} at a glance" (11.15 §5): photo and facts, warning chips first, then a five-axis chart in four steps. The
 * chart has no numbers and no "higher is better"; an axis the owner did not describe says "Not shared yet" and is
 * left out of the shape. It is the owner's description, not an assessment.
 */
export function PetGlanceCard({ name, species, facts, coverPublicId, profile, allergens, needs, bare, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const Wrapper = bare ? View : Card;
  const g = glance(species, profile, allergens);
  const axes = chartAxes(species);
  const levelOf = new Map(g.axes.map((a) => [a.axis, a]));
  const shape = axes.flatMap((axis, i) => {
    const level = levelOf.get(axis);
    return level ? [point(i, level.level / 4, axes.length)] : [];
  });
  const shapePoints = shape.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <Wrapper style={bare ? styles.bare : styles.card} testID={testID}>
      <View style={styles.header}>
        {coverPublicId ? (
          <Image source={{ uri: petPhotoThumb(coverPublicId, 160) }} style={styles.photo} />
        ) : (
          <Avatar kind="emoji" emoji={SPECIES_EMOJI[species]} size={72} />
        )}
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">{`${name} at a glance`}</Text>
          {facts ? <Text style={styles.facts}>{facts}</Text> : null}
        </View>
      </View>

      {g.chips.length > 0 ? (
        <View style={styles.chips} testID={testID ? `${testID}-chips` : undefined}>
          {g.chips.map((chip) => (
            <Tag key={chip.key} label={chip.tone === "warning" ? `⚠️ ${chip.text}` : chip.text} tone={TONE[chip.tone]} />
          ))}
        </View>
      ) : null}

      {g.axes.length > 0 ? (
        <View style={styles.chart} testID={testID ? `${testID}-chart` : undefined}>
          <Svg
            width="100%"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            accessibilityLabel={g.axes.map((a) => `${a.label}: ${a.word}`).join(", ")}
          >
            {[1, 2, 3, 4].map((ring) => (
              <Polygon
                key={ring}
                points={axes.map((_, i) => point(i, ring / 4, axes.length).join(",")).join(" ")}
                fill="none"
                stroke={theme.color.border}
                strokeWidth={1}
              />
            ))}
            {axes.map((_, i) => {
              const [x, y] = point(i, 1, axes.length);
              return <Line key={i} x1={CENTER_X} y1={CENTER_Y} x2={x} y2={y} stroke={theme.color.border} strokeWidth={1} />;
            })}
            {shape.length >= 3 ? (
              <Polygon points={shapePoints} fill={theme.color.primary} fillOpacity={0.25} stroke={theme.color.primary} strokeWidth={2} />
            ) : shape.length === 2 ? (
              <Polyline points={shapePoints} fill="none" stroke={theme.color.primary} strokeWidth={2} />
            ) : null}
            {axes.map((axis, i) => {
              const level = levelOf.get(axis);
              if (!level) return null;
              const [x, y] = point(i, level.level / 4, axes.length);
              return <Circle key={axis} cx={x} cy={y} r={4} fill={theme.color.primary} />;
            })}
            {axes.map((axis, i) => {
              const [x, y] = point(i, 1.3, axes.length);
              const level = levelOf.get(axis);
              const anchor = x < CENTER_X - 8 ? "end" : x > CENTER_X + 8 ? "start" : "middle";
              return (
                <G key={axis}>
                  <SvgText x={x} y={y - 2} textAnchor={anchor} fontFamily={FONT} fontSize={12} fontWeight="600" fill={level ? theme.color.text : theme.color.textMuted}>
                    {AXIS_LABEL[axis]}
                  </SvgText>
                  <SvgText x={x} y={y + 12} textAnchor={anchor} fontFamily={FONT} fontSize={12} fill={theme.color.textMuted}>
                    {level ? level.word : "Not shared yet"}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </View>
      ) : (
        <Text style={styles.muted} testID={testID ? `${testID}-none` : undefined}>
          Personality: not shared yet
        </Text>
      )}

      {needs && needs.chips.length > 0 ? (
        <View style={styles.needs} testID={testID ? `${testID}-needs` : undefined}>
          <Text style={styles.needsTitle}>{needs.basis ? `Needs (based on ${needs.basis})` : "Needs"}</Text>
          {needs.chips.map((chip) => (
            <Text key={`${chip.kind}-${chip.text}`} style={styles.needLine}>{`${NEEDS_LABEL[chip.kind]}: ${chip.text}`}</Text>
          ))}
          <View style={styles.sources}>
            {needs.sources.slice(0, 3).map((source, i) => (
              <LinkButton key={source.url} label={`Source: ${new URL(source.url).hostname.replace(/^www\./, "")}`} href={source.url} look="text" testID={testID ? `${testID}-source-${i + 1}` : `glance-source-${i + 1}`} />
            ))}
          </View>
        </View>
      ) : null}

      <Text style={styles.footnote}>Owner's description, not an assessment.</Text>
    </Wrapper>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.md },
    bare: { gap: theme.spacing.md },
    header: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
    photo: { width: 72, height: 72, borderRadius: theme.ui.radius.card, backgroundColor: theme.color.border },
    headerText: { flex: 1, gap: 2 },
    title: { fontSize: 18, lineHeight: 24, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    facts: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.textMuted },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    chart: { alignItems: "center" },
    needs: { gap: 2 },
    needsTitle: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    needLine: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.text },
    sources: { flexDirection: "row", flexWrap: "wrap", columnGap: theme.spacing.sm },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    footnote: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
