import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SitterActions } from "../../../../components/SitterActions";
import { NextOpenings, nextOpenings } from "../../../../components/NextOpenings";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Chip } from "../../../../components/ui/Chip";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { StarRating } from "../../../../components/StarRating";
import { RatingSummary, getRatingSummary } from "../../../../features/completion/completionApi";
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
import { TextButton } from "../../../../components/ui/TextButton";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { Theme } from "../../../../theme/themes";

type ProfileState =
  | { status: "loading" }
  | { status: "ready"; sitter: SitterProfileView }
  | { status: "missing" }
  | { status: "error"; message: string };

/** How far ahead the next openings look, and how many rows they show (#120). */
const LOOK_AHEAD_DAYS = 60;
const MAX_OPENINGS = 5;

/**
 * A sitter as owners see them (phase-03b 3B.2): intro + the next open days from
 * get_sitter_schedule (#120: openings here, the month and each day on their own pages). Book → 3B.3.
 */
export default function SitterProfileScreen() {
  const styles = useThemedStyles(makeStyles);
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
    } catch {
      setFavorite(!next);
    }
  };

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
          <Text accessibilityRole="header" style={styles.name} testID="sitter-name">
            {sitter.displayName}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          {favorite != null ? (
            <TextButton
              label={favorite ? "★ Favorite — shows first when you book" : "☆ Add to favorites"}
              onPress={() => void toggleFavorite()}
              testID="sitter-favorite"
            />
          ) : null}
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
                  <Text style={styles.body}>{`“${r.comment}” — ${r.reviewer}`}</Text>
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
