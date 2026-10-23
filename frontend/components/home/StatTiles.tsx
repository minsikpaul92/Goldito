import { StyleSheet, Text, View } from "react-native";

import { StayToday } from "../../features/care/useStayToday";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { tokens } from "../../theme/tokens";
import { IconName } from "../ui/Icon";
import { HomeArt } from "./HomeArt";
import { HOME_TEXT } from "./homeType";

type Tile = { key: string; icon: IconName; value: string; label: string; ground: string };

/** 75 -> "1h 15m", 40 -> "40m". */
export function walkLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const m = minutes % 60;
  return `${Math.floor(minutes / 60)}h${m ? ` ${m}m` : ""}`;
}

/** Today's numbers from the stay (Figma "tiles"). A number that isn't known is left out, never shown as a guess. */
export function StatTiles({ stay }: { stay: StayToday }) {
  const styles = useThemedStyles(makeStyles);
  const tiles: Tile[] = [
    ...(stay.care
      ? [{ key: "care", icon: "meal" as const, value: `${stay.care.done}/${stay.care.total}`, label: "care done", ground: tokens.color.blockMint }]
      : []),
    ...(stay.photos != null
      ? [{ key: "photos", icon: "camera" as const, value: String(stay.photos), label: "photos today", ground: tokens.color.blockPeach }]
      : []),
    ...(stay.walkMinutes != null
      ? [{ key: "walks", icon: "walk" as const, value: walkLabel(stay.walkMinutes), label: "of walks", ground: tokens.color.blockButter }]
      : []),
  ];
  if (tiles.length === 0) return null;

  return (
    <View style={styles.row} testID="stat-tiles">
      {tiles.map((t) => (
        <View key={t.key} style={[styles.tile, { backgroundColor: t.ground }]} testID={`stat-tile-${t.key}`}>
          <View style={styles.art}>
            <HomeArt name={t.icon} size={34} color={tokens.color.text} />
          </View>
          <Text style={styles.value}>{t.value}</Text>
          <Text style={styles.label}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: 10 },
    tile: { flex: 1, gap: 2, padding: 12, borderRadius: theme.radius.xl },
    art: { width: 46, height: 46, alignItems: "flex-start", justifyContent: "center" },
    value: {
      ...(theme.fontFamily.display ? { fontFamily: theme.fontFamily.display } : null),
      fontSize: HOME_TEXT.stat,
      lineHeight: 30,
      fontWeight: theme.fontWeight.bold,
      letterSpacing: -0.3,
      color: theme.color.text,
    },
    label: { fontSize: HOME_TEXT.small, lineHeight: 16.8, fontWeight: theme.fontWeight.bold, color: theme.color.textMuted },
  });
