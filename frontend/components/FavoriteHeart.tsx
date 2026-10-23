import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { Icon } from "./ui/Icon";
import { listFavoriteSitterIds, setFavoriteSitter } from "../features/sitters/sitterApi";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

/**
 * Favorite or not, as a heart (the same one as on the sitter's page). Favorites show first when the owner books; the
 * sitter is not told. Reads and writes `owner_favorite_sitters` for the signed-in owner.
 */
export function FavoriteHeart({ sitterId, sitterName }: { sitterId: string; sitterName: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [favorite, setFavorite] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    listFavoriteSitterIds()
      .then((ids) => live && setFavorite(ids.includes(sitterId)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [sitterId]);

  if (favorite === null) return null;
  const toggle = async () => {
    const next = !favorite;
    setFavorite(next);
    try {
      await setFavoriteSitter(sitterId, next);
      toast.show(next ? `${sitterName} is a favorite` : `${sitterName} removed from favorites`);
    } catch (e) {
      setFavorite(!next);
      toast.show((e as Error).message);
    }
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={favorite ? "Remove from favorites" : "Add to favorites"}
      accessibilityState={{ selected: favorite }}
      onPress={() => void toggle()}
      style={styles.row}
      testID="favorite-heart"
    >
      <Icon name="heart" filled={favorite} size={theme.icon.md} color={theme.color.primary} />
      <Text style={styles.label}>{favorite ? "Favorite" : `Add ${sitterName} to favorites`}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: 44 },
    label: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
  });
