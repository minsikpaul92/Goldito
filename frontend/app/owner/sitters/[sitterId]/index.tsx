import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PhotoViewer } from "../../../../components/PhotoViewer";
import { SitterActions } from "../../../../components/SitterActions";
import { Avatar } from "../../../../components/ui/Avatar";
import { NextOpenings, nextOpenings } from "../../../../components/NextOpenings";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Chip } from "../../../../components/ui/Chip";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { StarRating } from "../../../../components/StarRating";
import { RatingSummary, getRatingSummary } from "../../../../features/completion/completionApi";
import { ProfilePhoto, loadProfilePhotos, photoThumb } from "../../../../features/profile/profilePhotosApi";
import { addDays, appToday } from "../../../../features/schedule/dates";
import { DaySlot, loadSitterMonth } from "../../../../features/schedule/scheduleApi";
import {
  SERVICE_LABEL,
  SitterProfileView,
  getSitterProfile,
  listFavoriteSitterIds,
  ownersSetting,
  setFavoriteSitter,
  sitterMeta,
} from "../../../../features/sitters/sitterApi";
import { useTheme, useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";

type ProfileState =
  | { status: "loading" }
  | { status: "ready"; sitter: SitterProfileView }
  | { status: "missing" }
  | { status: "error"; message: string };

/** How far ahead the next openings look, and how many rows they show (#120). */
const LOOK_AHEAD_DAYS = 60;
const MAX_OPENINGS = 5;
/** The round cover photo in the header row (#136). */
const PHOTO_SIZE = 64;

/**
 * A sitter as owners see them (phase-03b 3B.2): intro + the next open days from
 * get_sitter_schedule (#120: openings here, the month and each day on their own pages). Book → 3B.3.
 */
export default function SitterProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const toast = useToast();
  const { sitterId } = useLocalSearchParams<{ sitterId: string }>();
  const today = useMemo(() => appToday(), []);

  const [profile, setProfile] = useState<ProfileState>({ status: "loading" });
  const [slots, setSlots] = useState<Map<string, DaySlot> | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [rating, setRating] = useState<RatingSummary | null>(null);
  /** Mine only (011h): favorites come first when I book. */
  const [favorite, setFavorite] = useState<boolean | null>(null);
  useEffect(() => {
    listFavoriteSitterIds()
      .then((ids) => setFavorite(ids.includes(sitterId)))
      .catch(() => setFavorite(null));
  }, [sitterId]);
  const toggleFavorite = async () => {
    if (favorite == null) return;
    const next = !favorite;
    setFavorite(next);
    try {
      await setFavoriteSitter(sitterId, next);
      toast.show(next ? "Added to favorites" : "Removed from favorites");
    } catch {
      setFavorite(!next);
      toast.show("Couldn't save. Try again.");
    }
  };

  /** Cover first (014g); a failed load just shows the initial. */
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  useEffect(() => {
    if (!sitterId) return;
    loadProfilePhotos(sitterId)
      .then(setPhotos)
      .catch(() => setPhotos([]));
  }, [sitterId]);

  const loadProfile = useCallback(async () => {
    if (!sitterId) return;
    try {
      const sitter = await getSitterProfile(sitterId);
      setProfile(sitter ? { status: "ready", sitter } : { status: "missing" });
    } catch (error) {
      setProfile({ status: "error", message: (error as Error).message });
    }
  }, [sitterId]);

  const loadSchedule = useCallback(async () => {
    if (!sitterId) return;
    setScheduleError(null);
    try {
      setSlots(await loadSitterMonth(sitterId, today, addDays(today, LOOK_AHEAD_DAYS - 1)));
    } catch (error) {
      setScheduleError((error as Error).message);
    }
  }, [sitterId, today]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (sitterId) void getRatingSummary(sitterId).then(setRating);
  }, [sitterId]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  if (profile.status === "loading") return <LoadingView />;

  if (profile.status === "missing") {
    return (
      <Screen>
        <EmptyState emoji="🔍" title="Sitter not found" message="This sitter may have left Goldito." />
      </Screen>
    );
  }

  if (profile.status === "error") {
    return (
      <Screen>
        <EmptyState
          emoji="🐾"
          title="Couldn't load this sitter"
          message={profile.message}
          action={{ label: "Try again", onPress: () => void loadProfile() }}
        />
      </Screen>
    );
  }

  const { sitter } = profile;
  const meta = sitterMeta(sitter);
  const openings = slots ? nextOpenings(slots, today, LOOK_AHEAD_DAYS, MAX_OPENINGS) : [];

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.content}>
        <Card style={styles.intro}>
          <View style={styles.header} testID="sitter-header">
            {photos.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`See ${sitter.displayName}'s photos`}
                onPress={() => setViewerOpen(true)}
                testID="sitter-photo"
              >
                <Avatar kind="photo" uri={photoThumb(photos[0], PHOTO_SIZE * 3)} size={PHOTO_SIZE} />
              </Pressable>
            ) : (
              <Avatar kind="initial" name={sitter.displayName} size={PHOTO_SIZE} testID="sitter-photo-initial" />
            )}
            <View style={styles.headerText}>
              <Text accessibilityRole="header" style={styles.name} numberOfLines={1} testID="sitter-name">
                {sitter.displayName}
              </Text>
              {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            </View>
            {favorite != null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={favorite ? "Remove from favorites" : "Add to favorites"}
                accessibilityState={{ selected: favorite }}
                hitSlop={theme.spacing.sm}
                onPress={() => void toggleFavorite()}
                style={styles.heart}
                testID="sitter-favorite"
              >
                <Ionicons
                  name={favorite ? "heart" : "heart-outline"}
                  size={theme.icon.md}
                  color={theme.color.primary}
                />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.chips}>
            {sitter.services.map((service) => (
              <Chip key={service} label={SERVICE_LABEL[service]} testID={`sitter-service-${service}`} />
            ))}
            <Chip label={ownersSetting(sitter.acceptsMultipleOwners).badge} testID="sitter-owners-badge" />
          </View>
          <Text style={styles.ownersHint} testID="sitter-owners-hint">{ownersSetting(sitter.acceptsMultipleOwners).hint}</Text>
          {rating && rating.count > 0 && rating.avg != null ? (
            <View style={styles.block} testID="sitter-rating">
              <Text style={styles.label} testID="sitter-rating-line">
                {`★ ${rating.avg.toFixed(1)} · ${rating.count} ${rating.count === 1 ? "review" : "reviews"}`}
              </Text>
              {rating.recent.map((r, i) => (
                <View key={`${r.createdAt}-${i}`} style={styles.block} testID="sitter-review">
                  <StarRating value={r.rating} size={14} />
                  <Text style={styles.body}>{`“${r.comment}” · ${r.reviewer}`}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {sitter.bio ? <Text style={styles.body}>{sitter.bio}</Text> : null}
          {sitter.homeNotes ? (
            <View style={styles.block}>
              <Text style={styles.label}>About their home</Text>
              <Text style={styles.body}>{sitter.homeNotes}</Text>
            </View>
          ) : null}
        </Card>
  
        <View style={styles.block}>
          <Text accessibilityRole="header" style={styles.label}>
            Next openings
          </Text>
          {scheduleError ? (
            <EmptyState
              emoji="📅"
              title="Couldn't load the schedule"
              message={scheduleError}
              action={{ label: "Try again", onPress: () => void loadSchedule() }}
            />
          ) : !slots ? (
            <Text style={styles.meta}>Loading…</Text>
          ) : openings.length > 0 ? (
            <NextOpenings openings={openings} onOpenDay={(d) => router.push(`/owner/sitters/${sitter.id}/day/${d}`)} />
          ) : (
            <Text style={styles.meta} testID="sitter-no-openings">No open days in the next two months.</Text>
          )}
          <Button
            label="See full month"
            variant="secondary"
            onPress={() => router.push(`/owner/sitters/${sitter.id}/calendar`)}
            testID="sitter-see-month"
          />
        </View>
      </Screen>
      <SitterActions sitter={sitter} />
      <PhotoViewer visible={viewerOpen} photos={photos} onClose={() => setViewerOpen(false)} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    ownersHint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    content: {
      gap: theme.spacing.md,
    },
    intro: {
      gap: theme.spacing.sm,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    headerText: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    heart: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    name: {
      fontSize: theme.fontSize.title,
      fontWeight: theme.fontWeight.bold,
      color: theme.color.text,
    },
    meta: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    block: {
      gap: theme.spacing.xs,
    },
    label: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    body: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
  });
