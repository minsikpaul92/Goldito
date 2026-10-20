import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "../../components/ui/Avatar";
import { thumbUrl, videoPosterUrl } from "../../lib/cloudinary";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Species } from "../../types/db";
import { DIARY_FONT, useDiaryFont } from "../snap/DecoratedReport";
import { SPIRAL_W, SpiralEdge } from "./SpiralEdge";
import { SPECIES_EMOJI } from "../pets/petFormat";
import type { ReportPhoto } from "./reportApi";

type Props = {
  petName: string;
  species: Species;
  pages: number;
  /** The pet's newest photo; without one the cover shows the species emoji. */
  photo?: ReportPhoto | null;
  onPress: () => void;
  testID?: string;
};

/**
 * A pet's diary cover (wireframe, no Figma frame yet): the pet's photo and name on a spiral-bound cover. Tapping it opens
 * that pet's diary.
 */
export function DiaryCover({ petName, species, pages, photo, onPress, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  useDiaryFont();
  const uri = photo ? (photo.resourceType === "video" ? videoPosterUrl(photo.publicId, 400) : thumbUrl(photo.publicId, 400)) : "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${petName}'s diary`}
      onPress={onPress}
      style={({ pressed }) => [styles.cover, pressed && styles.pressed]}
      testID={testID}
    >
      <SpiralEdge />
      <View style={styles.photo}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : <Avatar kind="emoji" emoji={SPECIES_EMOJI[species]} size={72} />}
      </View>
      <View style={styles.label}>
        <Text style={styles.name} numberOfLines={1}>{`${petName}'s diary`}</Text>
        <Text style={styles.count}>{`${pages} page${pages === 1 ? "" : "s"}`}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    cover: {
      marginLeft: SPIRAL_W,
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.primary,
    },
    pressed: { opacity: 0.85 },
    photo: {
      height: 130,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.accent,
    },
    label: { alignItems: "center", paddingVertical: theme.spacing.xs, borderRadius: theme.radius.sm, backgroundColor: theme.color.surface },
    name: { fontFamily: DIARY_FONT, fontSize: theme.fontSize.body + 4, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    count: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
