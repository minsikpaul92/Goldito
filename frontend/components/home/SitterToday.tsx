import { router, useFocusEffect } from "expo-router";
import { ReactNode, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PetCaution, listPetCautions } from "../../features/care/careApi";
import { ChangeRequest, listPendingChangeRequests } from "../../features/care/carePlanApi";
import { useDueReminder } from "../../features/care/useDueReminder";
import { TaskItem, useTodayTasks } from "../../features/care/useTodayTasks";
import type { CaringPet } from "../../features/feed/caringPets";
import { SPECIES_EMOJI } from "../../features/pets/petFormat";
import { formatTime, isoToZoned } from "../../features/schedule/dates";
import { useNotifications } from "../../providers/NotificationsProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { tokens } from "../../theme/tokens";
import { DueAlert } from "../DueAlert";
import { TaskDoneSheet } from "../TaskDoneSheet";
import { Icon, IconName } from "../ui/Icon";
import { Screen } from "../ui/Screen";
import { sectionTitleStyle } from "../ui/SectionTitle";
import { Sheet } from "../ui/Sheet";
import { TextButton } from "../ui/TextButton";
import { CheckinTiles } from "./CheckinTiles";
import { HomeArt } from "./HomeArt";
import { HOME_TEXT } from "./homeType";

const TASK_ART: Record<string, IconName> = { medication: "pill", feeding: "meal", walk: "walk", litter: "potty", play: "paw", sleep: "nap" };

/**
 * Sitter Home while a stay is on, front side (Figma 1730:104473): the next task with Complete with photo, the owner's
 * Heads-up, Quick check-in tiles, and the two action cards. The pixel pet room is the back side (Pager).
 * `top` and `bottom` carry the banners and the handoff lists Home already had.
 */
export function SitterToday({ pets, top, bottom }: { pets: CaringPet[]; top?: ReactNode; bottom?: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const taskPets = useMemo(() => pets.map((p) => ({ id: p.id, name: p.name, ownerName: p.ownerName })), [pets]);
  const { state, reload } = useTodayTasks(taskPets);
  const [finishing, setFinishing] = useState<TaskItem | null>(null);
  const [selected, setSelected] = useState(pets[0]?.id);
  const [cautions, setCautions] = useState<PetCaution[]>([]);
  const [showCautions, setShowCautions] = useState(false);
  const [requests, setRequests] = useState<(ChangeRequest & { petName: string })[]>([]);
  const pet = pets.find((p) => p.id === selected) ?? pets[0];

  const petKey = pets.map((p) => p.id).join(",");
  // A new care request from the owner shows without a refresh (FB-2).
  const { bookingsRevision } = useNotifications();
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void listPendingChangeRequests()
        .then((list) => live && setRequests(list))
        .catch(() => undefined);
      void listPetCautions(pets.map((p) => p.id))
        .then((list) => live && setCautions(list))
        .catch(() => undefined);
      return () => {
        live = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [petKey, bookingsRevision]),
  );

  const items = state.status === "ready" ? state.items : [];
  const reminder = useDueReminder(items, state.status === "ready", reload);
  const open = items.filter((i) => i.log.status === "pending");
  const done = items.length - open.length;
  const next = open[0];
  const petName = (id: string) => pets.find((p) => p.id === id)?.name ?? "";
  const manyPets = pets.length > 1;

  if (!pet) return null;
  const dueNow = next ? new Date(next.log.due_at).getTime() <= Date.now() : false;

  return (
    <Screen contentStyle={styles.page} testID="sitter-home">
      <View style={styles.page} testID="sitter-dashboard">
        {top}

        {/* An owner's care request is waiting for an answer: one line, the whole request one tap away. */}
        {requests.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Care request for ${requests[0].petName} is waiting`}
            onPress={() => router.push(`/sitter/care-request/${requests[0].id}`)}
            style={({ pressed }) => [styles.line, pressed && styles.pressed]}
            testID="request-line"
          >
            <Text style={styles.lineText} numberOfLines={1}>{`📝 Care request for ${requests[0].petName}`}</Text>
            <Text style={styles.lineMore}>{requests.length > 1 ? `+${requests.length - 1}` : "›"}</Text>
          </Pressable>
        ) : null}

        {state.status === "error" ? <Text style={styles.error}>{state.message}</Text> : null}

        {next ? (
          <View style={styles.hero} testID="dashboard-next">
            <View style={styles.heroTop}>
              <Text style={styles.heroKicker} testID="tasks-next-time">{`${dueNow ? "Due now" : "Next"} · ${formatTime(isoToZoned(next.log.due_at).time)}`}</Text>
              <HomeArt name={TASK_ART[next.task.type] ?? "paw"} size={44} color={tokens.color.onMedia} />
            </View>
            <Text style={styles.heroTitle} numberOfLines={2} testID="tasks-next">
              {`${next.pet.name} · ${next.task.title}`}
            </Text>
            <Text style={styles.heroSub}>
              {[next.task.dose, `From ${next.pet.ownerName}'s checklist`, `${done} of ${items.length} done today`].filter(Boolean).join(" · ")}
            </Text>
            {reminder.snoozedUntil[next.log.id] ? (
              <Text style={styles.heroSub} testID="tasks-snoozed">
                {`💤 Snoozed until ${new Date(reminder.snoozedUntil[next.log.id]).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => setFinishing(next)}
              style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
              testID="dashboard-next-done"
            >
              <Icon name="camera" size={20} color={tokens.color.text} />
              <Text style={styles.heroButtonText}>Complete with photo</Text>
            </Pressable>
          </View>
        ) : items.length > 0 ? (
          <View style={styles.hero} testID="tasks-all-done">
            <Text style={styles.heroKicker}>Today</Text>
            <Text style={styles.heroTitle}>All done for today</Text>
            <Text style={styles.heroSub}>{`${done} of ${items.length} done`}</Text>
          </View>
        ) : null}

        {/* The owner's Heads-ups for the pets in care: one line here, all of them one tap away. */}
        {cautions.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Heads-up: ${cautions.length} things to watch out for`}
            onPress={() => setShowCautions(true)}
            style={({ pressed }) => [styles.headsUp, pressed && styles.pressed]}
            testID="headsup-compact"
          >
            <Icon name="warning" size={14} color={tokens.color.warning} />
            <Text style={styles.headsUpText} numberOfLines={1}>
              {manyPets ? `${petName(cautions[0].petId)}: ${cautions[0].text}` : cautions[0].text}
            </Text>
            {cautions.length > 1 ? <Text style={styles.headsUpText}>{`+${cautions.length - 1}`}</Text> : null}
          </Pressable>
        ) : null}

        <Text accessibilityRole="header" style={styles.heading} testID="quick-heading">
          {`Quick check-in · ${pet.name}`}
        </Text>
        {manyPets ? (
          <View style={styles.chips}>
            {pets.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityState={{ selected: p.id === pet.id }}
                hitSlop={4}
                onPress={() => setSelected(p.id)}
                style={({ pressed }) => [styles.chip, p.id === pet.id && styles.chipOn, pressed && styles.pressed]}
                testID={`caring-pet-${p.id}`}
              >
                <Text style={[styles.chipText, p.id === pet.id && styles.chipTextOn]}>{`${SPECIES_EMOJI[p.species]} ${p.name}`}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <CheckinTiles key={pet.id} pet={pet} />

        <View style={styles.acts}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/sitter/checkin/${pet.id}`)}
            style={({ pressed }) => [styles.act, pressed && styles.pressed]}
            testID="action-five-second"
          >
            <HomeArt name="camera" size={30} color={tokens.color.text} />
            <View style={styles.actText}>
              <Text style={styles.actTitle}>5-second check</Text>
              <Text style={styles.actSub} numberOfLines={1}>{`Today's note for ${pet.ownerName}`}</Text>
            </View>
            <Icon name="forward" size={22} color={tokens.color.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/sitter/snap/treat")}
            style={({ pressed }) => [styles.act, pressed && styles.pressed]}
            testID="action-treat-check"
          >
            <HomeArt name="treat" size={30} color={tokens.color.text} />
            <View style={styles.actText}>
              <Text style={styles.actTitle}>Treat check</Text>
              <Text style={styles.actSub} numberOfLines={1}>{`In Snap · checks ${pet.name}'s allergies`}</Text>
            </View>
            <Icon name="forward" size={22} color={tokens.color.text} />
          </Pressable>
        </View>

        <View style={styles.links}>
          <TextButton label="All tasks" onPress={() => router.push("/sitter/tasks")} testID="shortcut-tasks" />
          <TextButton label="My history" onPress={() => router.push("/sitter/history")} testID="shortcut-history" />
        </View>

        {bottom}

        <Sheet visible={showCautions} title="Heads-up" onClose={() => setShowCautions(false)} testID="headsup-sheet">
          {pets
            .filter((p) => cautions.some((c) => c.petId === p.id))
            .map((p) => (
              <View key={p.id} style={styles.cautionGroup}>
                <Text style={styles.cautionTitle}>{`${SPECIES_EMOJI[p.species]} ${p.name} from ${p.ownerName}`}</Text>
                {cautions
                  .filter((c) => c.petId === p.id)
                  .map((c) => (
                    <Text key={c.id} style={styles.cautionLine}>{`• ${c.text}`}</Text>
                  ))}
              </View>
            ))}
        </Sheet>
        <DueAlert reminder={reminder} paused={finishing != null} onDone={setFinishing} />
        <TaskDoneSheet item={finishing} onClose={() => setFinishing(null)} onDone={() => void reload()} />
      </View>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Figma body: 14 between blocks.
    page: { gap: 14 },
    hero: { backgroundColor: tokens.color.primary, borderRadius: 28, padding: 18, gap: 8 },
    heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    heroKicker: { fontSize: HOME_TEXT.small, fontWeight: theme.fontWeight.bold, letterSpacing: 0.72, textTransform: "uppercase", color: theme.color.accent },
    heroTitle: {
      ...(theme.fontFamily.display ? { fontFamily: theme.fontFamily.display } : { fontWeight: theme.fontWeight.bold }),
      fontSize: HOME_TEXT.hero,
      lineHeight: 26.25,
      color: tokens.color.onMedia,
    },
    heroSub: { fontSize: HOME_TEXT.body, lineHeight: 17.5, color: theme.color.accent },
    heroButton: {
      minHeight: 52,
      marginTop: theme.spacing.xs,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
    },
    heroButtonText: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    headsUp: {
      alignSelf: "flex-start",
      maxWidth: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      backgroundColor: tokens.color.warningSurface,
    },
    headsUpText: { flexShrink: 1, fontSize: HOME_TEXT.body, lineHeight: 17.5, fontWeight: theme.fontWeight.bold, color: tokens.color.warning },
    heading: sectionTitleStyle(theme),
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    chip: {
      minHeight: 36,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    chipOn: { backgroundColor: theme.color.primary },
    chipText: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
    chipTextOn: { color: theme.color.primaryText },
    acts: { gap: 8 },
    act: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingLeft: 12,
      paddingRight: 14,
      paddingVertical: 10,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: theme.color.text,
      backgroundColor: theme.color.surface,
    },
    actText: { flex: 1, gap: 1.5 },
    actTitle: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    actSub: { fontSize: HOME_TEXT.body, lineHeight: 17.5, color: theme.color.textMuted },
    links: { flexDirection: "row", justifyContent: "center", gap: theme.spacing.lg },
    line: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    lineText: { flex: 1, fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    lineMore: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primary },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
    cautionGroup: { gap: 2, marginBottom: theme.spacing.sm },
    cautionTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    cautionLine: { fontSize: theme.fontSize.body, color: theme.color.text },
    pressed: { opacity: 0.8 },
  });
