import { StyleSheet, Text, View } from "react-native";

import { StayToday } from "../../features/care/useStayToday";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { tokens } from "../../theme/tokens";
import type { ArtName } from "../../assets/art/artSvgs";
import { IconName } from "../ui/Icon";
import { HomeArt } from "./HomeArt";
import { HOME_TEXT } from "./homeType";

type Tile = { key: string; icon: IconName; art: ArtName; value: string; label: string; ground: string };

/** 75 -> "1h 15m", 40 -> "40m", 0 -> "0m". */
export function walkLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const m = minutes % 60;
  return `${Math.floor(minutes / 60)}h${m ? ` ${m}m` : ""}`;
}

/** Today's numbers from the stay (Figma "tiles"). Nothing logged yet reads 0/0, 0 and 0m. */
export function StatTiles({ stay }: { stay: StayToday }) {
  const styles = useThemedStyles(makeStyles);
  const tiles: Tile[] = [
    { key: "care", icon: "meal", art: "owner/care-bowl", value: `${stay.care.done}/${stay.care.total}`, label: "care done", ground: tokens.color.blockMint },
    { key: "photos", icon: "camera", art: "owner/camera", value: String(stay.photos), label: "photos today", ground: tokens.color.blockPeach },
    { key: "walks", icon: "walk", art: "owner/tree", value: walkLabel(stay.walkMinutes), label: "of walks", ground: tokens.color.blockButter },
  ];

  return (
    <View style={styles.row} testID="stat-tiles">
      {tiles.map((t) => (
        <View key={t.key} style={[styles.tile, { backgroundColor: t.ground }]} testID={`stat-tile-${t.key}`}>
          <View style={styles.art}>
            <HomeArt name={t.icon} art={t.art} size={46} color={tokens.color.text} />
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
