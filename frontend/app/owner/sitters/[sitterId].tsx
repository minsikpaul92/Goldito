import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { InquirySheet } from "../../../components/InquirySheet";
import { STATE_LABEL, SlotCalendar } from "../../../components/SlotCalendar";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Chip } from "../../../components/ui/Chip";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { StarRating } from "../../../components/StarRating";
import { RatingSummary, getRatingSummary } from "../../../features/completion/completionApi";
import { addMonths, appToday, formatDay, formatTime, monthEnd, monthStart } from "../../../features/schedule/dates";
import { DaySlot, SLOTS, loadSitterMonth, slotKey } from "../../../features/schedule/scheduleApi";
import {
  SERVICE_LABEL,
  SitterProfileView,
  getSitterProfile,
  listFavoriteSitterIds,
  setFavoriteSitter,
  sitterMeta,
} from "../../../features/sitters/sitterApi";
import { TextButton } from "../../../components/ui/TextButton";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

type ProfileState =
  | { status: "loading" }
  | { status: "ready"; sitter: SitterProfileView }
  | { status: "missing" }
  | { status: "error"; message: string };

/** "Morning: Open · 8:00 AM–12:00 PM · 2 spots left" — never who else booked. */
function slotLine(label: string, s: DaySlot | undefined): string {
  const state = s?.state ?? "closed";
  if (state !== "open" && state !== "full") return `${label}: ${STATE_LABEL.closed}`;
  const hours = s?.startsAt && s.endsAt ? ` · ${formatTime(s.startsAt)}–${formatTime(s.endsAt)}` : "";
  const spots = state === "full" ? "" : ` · ${s?.remaining === 1 ? "1 spot" : `${s?.remaining} spots`} left`;
  return `${label}: ${STATE_LABEL[state]}${hours}${spots}`;
}

/**
 * A sitter as owners see them (phase-03b 3B.2): intro + month schedule from
 * get_sitter_schedule (own hours, open / full / closed, spots left). Book this sitter → 3B.3.
 */
export default function SitterProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const { sitterId } = useLocalSearchParams<{ sitterId: string }>();
  const today = useMemo(() => appToday(), []);

  const [profile, setProfile] = useState<ProfileState>({ status: "loading" });
  const [month, setMonth] = useState(() => monthStart(today));
  const [slots, setSlots] = useState<Map<string, DaySlot> | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
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
      setSlots(await loadSitterMonth(sitterId, monthStart(month), monthEnd(month)));
    } catch (error) {
      setScheduleError((error as Error).message);
    }
  }, [sitterId, month]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (sitterId) void getRatingSummary(sitterId).then(setRating);
  }, [sitterId]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const changeMonth = (n: number) => {
    setDay(null);
    setSlots(null);
    setMonth((m) => addMonths(m, n));
  };

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
          </View>
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
            Schedule
          </Text>
          <SlotCalendar
            month={month}
            today={today}
            slots={slots ?? new Map()}
            selection={day ? { from: day, to: day } : null}
            onSelectDay={setDay}
            onPrevMonth={() => changeMonth(-1)}
            onNextMonth={() => changeMonth(1)}
            canGoPrev={month > monthStart(today)}
          />
          {scheduleError ? (
            <EmptyState
              emoji="📅"
              title="Couldn't load the schedule"
              message={scheduleError}
              action={{ label: "Try again", onPress: () => void loadSchedule() }}
            />
          ) : null}
        </View>
  
        <Card>
          {day && slots ? (
            <View style={styles.block} testID="sitter-day">
              <Text style={styles.label}>{formatDay(day)}</Text>
              {SLOTS.map(({ slot, label }) => (
                <Text key={slot} style={styles.body} testID={`sitter-day-${slot}`}>
                  {slotLine(label, slots.get(slotKey(day, slot)))}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.meta}>Tap a day to see {sitter.displayName}'s hours and open spots.</Text>
          )}
        </Card>
      </Screen>
      <View style={styles.footer}>
        {/* FB-33: asking first reads as "before booking", next to Book — Book stays the one filled button. */}
        <View style={styles.actions}>
          <Button
            label="Ask before booking"
            variant="secondary"
            onPress={() => setAsking(true)}
            style={styles.action}
            testID="ask-about-stay"
          />
          <Button
            label="Book"
            onPress={() => router.push(`/owner/bookings/new?sitter=${sitter.id}`)}
            style={styles.action}
            testID="book-this-sitter"
          />
        </View>
        <Text style={styles.actionsHint}>Ask about dates, price or care first — nothing is booked until you send a request.</Text>
      </View>
      <InquirySheet visible={asking} onClose={() => setAsking(false)} sitter={sitter} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    footer: {
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    actions: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    action: {
      flex: 1,
    },
    actionsHint: {
      marginTop: theme.spacing.xs,
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      textAlign: "center",
    },
    content: {
      gap: theme.spacing.md,
    },
    intro: {
      gap: theme.spacing.sm,
    },
    name: {
      fontSize: theme.fontSize.title,
      fontWeight: "700",
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
      fontWeight: "600",
      color: theme.color.text,
    },
    body: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
  });
