import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { AlertModal } from "../../components/ui/AlertModal";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { Tag } from "../../components/ui/Tag";
import { TextButton } from "../../components/ui/TextButton";
import { ApiError } from "../../lib/api";
import { UploadError, uploadMedia } from "../../lib/cloudinary";
import { pickMedia } from "../../lib/media";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { PetChips, PetOption, PetsState, Role, SnapPets } from "./SnapPets";
import { SafetyCheck, acknowledgeCheck, checkTreat, getCheck, listRecentChecks } from "./treatApi";
import { formatDay, isoToZoned } from "../schedule/dates";

type Step = "uploading" | "reading" | "checking";

/** The server does not report its steps: after this long the vision model has usually read the label. */
const READING_MS = 8000;
const DISCLAIMER = "AI can be wrong. Always double-check the label, and ask your vet if you're unsure.";
const UNREADABLE = "Couldn't read the label. Try a closer, well-lit photo.";

/**
 * Snap → Treat check (Phase 12.1c, D61, the Phase 08 design): pick the pet → snap the label → the server reads it,
 * checks the rule table, asks FDA pages and the reasoning model → DANGER / WARNING / SAFE with sources.
 * DANGER is a red full-screen modal that closes only through "I understand, don't feed" (DESIGN.md §7.4).
 * Owners check their own pets; a sitter only the pets in their care right now (the API enforces both).
 */
export function TreatCheckScreen({ role }: { role: Role }) {
  return <SnapPets role={role}>{(pets) => <TreatCheck role={role} pets={pets} />}</SnapPets>;
}

function TreatCheck({ role, pets }: { role: Role; pets: PetsState }) {
  const styles = useThemedStyles(makeStyles);
  const errorDialog = useErrorDialog();
  const { check: checkParam, pet: petParam } = useLocalSearchParams<{ check?: string; pet?: string }>();

  // The Snap tab passes the pet it had picked (`?pet=`).
  const [petId, setPetId] = useState<string | null>(petParam ?? null);
  const [step, setStep] = useState<Step | null>(null);
  const [result, setResult] = useState<SafetyCheck | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [recent, setRecent] = useState<SafetyCheck[]>([]);
  const [acknowledging, setAcknowledging] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const readingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pet = pets.status === "ready" ? (pets.pets.find((p) => p.id === petId) ?? null) : null;

  // One pet → no choice to make.
  useEffect(() => {
    if (pets.status === "ready" && !petId && pets.pets.length === 1) setPetId(pets.pets[0].id);
  }, [pets, petId]);

  // Opened from the owner's "Blocked a risky treat" notice: show that check (and its red screen if nobody confirmed it yet).
  useEffect(() => {
    if (!checkParam) return;
    let live = true;
    void getCheck(checkParam)
      .then((check) => {
        if (!live || !check) return;
        setPetId(check.petId);
        setResult(check);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [checkParam]);

  const loadRecent = useCallback(async (id: string) => {
    try {
      setRecent(await listRecentChecks(id));
    } catch {
      setRecent([]); // The list is a bonus; checking works without it.
    }
  }, []);

  useEffect(() => {
    if (petId) void loadRecent(petId);
    else setRecent([]);
  }, [petId, loadRecent]);

  useEffect(() => () => {
    if (readingTimer.current) clearTimeout(readingTimer.current);
  }, []);

  const runCheck = async (forPet: PetOption, mediaId: string) => {
    setStep("reading");
    readingTimer.current = setTimeout(() => setStep("checking"), READING_MS);
    try {
      const checked = await checkTreat(forPet.id, mediaId);
      setResult(checked);
      setShowIngredients(false);
      void loadRecent(forPet.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setUnreadable(true);
      } else {
        errorDialog.show({
          title: "Treat not checked",
          message: (error as Error).message || "Couldn't check this treat. Try again.",
          onRetry: () => void runCheck(forPet, mediaId),
        });
      }
    } finally {
      if (readingTimer.current) clearTimeout(readingTimer.current);
      readingTimer.current = null;
      setStep(null);
    }
  };

  const snapLabel = async () => {
    if (!pet || step) return;
    const picked = await pickMedia({ purpose: "safety_label", confirm: true, confirmLabel: `Check for ${pet.name}` });
    if (!picked) return;
    const forPet = pet;
    setResult(null);
    setUnreadable(false);
    setStep("uploading");
    let mediaId: string;
    try {
      mediaId = (await uploadMedia({ petId: forPet.id, purpose: "safety_label", file: picked.file, resourceType: "image" }))
        .mediaId;
    } catch (error) {
      setStep(null);
      const message = error instanceof UploadError || error instanceof Error ? error.message : "Couldn't upload this photo.";
      errorDialog.show({ title: "Photo not uploaded", message, onRetry: () => void snapLabel() });
      return;
    }
    await runCheck(forPet, mediaId);
  };

  const acknowledge = async () => {
    if (!result || acknowledging) return;
    setAcknowledging(true);
    try {
      const at = await acknowledgeCheck(result.id);
      setResult({ ...result, acknowledgedAt: at });
      setRecent((list) => list.map((c) => (c.id === result.id ? { ...c, acknowledgedAt: at } : c)));
    } catch (error) {
      errorDialog.show({ title: "Not saved", message: (error as Error).message, onRetry: () => void acknowledge() });
    } finally {
      setAcknowledging(false);
    }
  };

  if (pets.status === "loading") return <LoadingView />;
  if (pets.status === "error") {
    return (
      <Screen>
        <EmptyState icon="label" title="Couldn't load your pets" message={pets.message} />
      </Screen>
    );
  }
  if (pets.pets.length === 0) {
    return (
      <Screen>
        <View testID="treat-no-pets">
          {role === "sitter" ? (
            <EmptyState
              icon="label"
              title="No pet in your care right now"
              message="Treat check opens for the pets you look after, while their stay is on."
            />
          ) : (
            <EmptyState
              icon="label"
              title="Add a pet first"
              message="Treat check reads a label against your pet's allergies and foods unsafe for their species."
              action={{ label: "Add pet", onPress: () => router.push("/owner-onboarding?add=1") }}
            />
          )}
        </View>
      </Screen>
    );
  }

  const name = pet?.name ?? "your pet";
  const danger = result?.safety_status === "DANGER";
  const busyText =
    step === "uploading" || step === "reading" ? "Reading the label…" : step === "checking" ? `Checking for ${name}…` : null;

  return (
    <Screen
      contentStyle={styles.content}
      // Always in view, not at the end of a long result.
      footer={
        <Text style={styles.disclaimer} testID="treat-disclaimer">
          {DISCLAIMER}
        </Text>
      }
      testID="treat-check"
    >
      <View style={styles.section}>
        <Text style={styles.label}>{role === "sitter" ? "Which pet in your care?" : "Which pet?"}</Text>
        <PetChips
          pets={pets.pets}
          selectedId={petId}
          disabled={!!step}
          onSelect={(id) => {
            if (!id || id === petId) return;
            setPetId(id);
            setResult(null);
            setUnreadable(false);
          }}
          testIDPrefix="treat-pet"
        />
      </View>

      {busyText ? (
        <View style={styles.busy} testID="treat-busy">
          <ActivityIndicator />
          <Text style={styles.busyText} testID="treat-busy-text">
            {busyText}
          </Text>
        </View>
      ) : null}

      {unreadable && !step ? (
        <Text style={styles.unreadable} testID="treat-unreadable">
          {UNREADABLE}
        </Text>
      ) : null}

      {result && !step ? (
        <ResultCard
          result={result}
          petName={name}
          role={role}
          showIngredients={showIngredients}
          onToggleIngredients={() => setShowIngredients((v) => !v)}
        />
      ) : null}

      <Button
        label={!pet ? "Pick a pet first" : unreadable || result?.partial_label ? "Retake photo" : result ? "Check another treat" : "Snap a label"}
        ai
        onPress={() => void snapLabel()}
        disabled={!pet || !!step}
        testID="treat-snap"
      />

      {recent.length > 0 ? (
        <View style={styles.section} testID="treat-recent">
          <Text style={styles.label}>Recent checks</Text>
          {recent.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              disabled={!!step}
              onPress={() => {
                setResult(c);
                setUnreadable(false);
                setShowIngredients(false);
              }}
              style={styles.recentRow}
              testID="treat-recent-row"
            >
              <StatusBadge status={c.safety_status} />
              <Text style={styles.recentName} numberOfLines={1}>
                {c.product_name || "Treat label"}
              </Text>
              <Text style={styles.recentDate}>{formatDay(isoToZoned(c.createdAt).day)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <AlertModal
        visible={!!result && danger && !result.acknowledgedAt && !step}
        title={`Don't give this to ${name}`}
        message={result?.warning_message || `This treat isn't safe for ${name}.`}
        chips={result ? [...result.matched_allergens, ...result.toxic_ingredients] : []}
        actionLabel="I understand, don't feed"
        onAcknowledge={() => void acknowledge()}
        busy={acknowledging}
        testID="treat-danger"
      />
    </Screen>
  );
}

export function StatusBadge({ status }: { status: SafetyCheck["safety_status"] }) {
  return <Tag label={status} tone={status === "DANGER" ? "danger" : status === "WARNING" ? "warning" : "success"} />;
}

function ResultCard({
  result,
  petName,
  role,
  showIngredients,
  onToggleIngredients,
}: {
  result: SafetyCheck;
  petName: string;
  role: Role;
  showIngredients: boolean;
  onToggleIngredients: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const status = result.safety_status;
  const color = status === "DANGER" ? theme.color.error : status === "WARNING" ? theme.color.warning : theme.color.success;
  const headline =
    status === "DANGER"
      ? `Not safe for ${petName}`
      : status === "WARNING"
        ? role === "sitter"
          ? "Ask the owner first"
          : "Check with your vet first"
        : `Looks fine for ${petName}`;
  const flagged = [...result.matched_allergens, ...result.toxic_ingredients];

  return (
    <View style={[styles.card, { borderColor: color }]} testID={`treat-result-${status.toLowerCase()}`}>
      <Text style={[styles.headline, { color }]} testID="treat-result-headline">
        {headline}
      </Text>
      {result.product_name ? <Text style={styles.product}>{result.product_name}</Text> : null}
      {result.warning_message ? (
        <Text style={styles.body} testID="treat-result-message">
          {result.warning_message}
        </Text>
      ) : null}

      {flagged.length > 0 ? (
        <View style={styles.chips}>
          {flagged.map((item) => (
            <View key={item} style={[styles.flag, { borderColor: color }]}>
              <Text style={[styles.flagLabel, { color }]}>{item}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {result.hidden_sources.length > 0 ? (
        <View style={styles.section} testID="treat-hidden">
          {result.hidden_sources.map((h) => (
            <Text key={h.ingredient} style={styles.body}>
              <Text style={styles.strong}>{h.ingredient}</Text> may contain {h.may_contain}
              {h.reason ? `: ${h.reason}` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      {result.partial_label ? (
        <Text style={styles.note} testID="treat-partial">
          We could only read part of the label. Retake a photo of the whole ingredient list.
        </Text>
      ) : null}

      {!result.double_checked ? (
        <Text style={styles.note} testID="treat-not-double-checked">
          We couldn&apos;t double-check this one.
        </Text>
      ) : null}

      {result.sources.length > 0 || result.sources_unavailable ? (
        <View style={styles.section}>
          <Text style={styles.label}>Sources</Text>
          {result.sources_unavailable && result.sources.length === 0 ? (
            <Text style={styles.note} testID="treat-sources-unavailable">
              Sources unavailable right now.
            </Text>
          ) : (
            <View style={styles.chips}>
              {result.sources.map((s) => (
                <Pressable
                  key={s.url}
                  accessibilityRole="link"
                  accessibilityLabel={`${s.title} (${s.domain})`}
                  onPress={() => void Linking.openURL(s.url)}
                  style={styles.source}
                  testID="treat-source"
                >
                  <Text style={styles.sourceTitle} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={styles.sourceDomain}>{s.domain}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {result.sources_unavailable && result.sources.length > 0 ? (
            <Text style={styles.note} testID="treat-sources-unavailable">
              Live sources are down. These come from our safety list.
            </Text>
        ) : null}
      </View>
      ) : null}

      {result.detected_ingredients.length > 0 ? (
        <View style={styles.section}>
          <TextButton
            label={showIngredients ? "Hide ingredients" : `Ingredients we read (${result.detected_ingredients.length})`}
            onPress={onToggleIngredients}
            style={styles.toggle}
            testID="treat-ingredients-toggle"
          />
          {showIngredients ? (
            <Text style={styles.note} testID="treat-ingredients">
              {result.detected_ingredients.join(", ")}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    section: { gap: theme.spacing.sm },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    busy: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    busyText: { fontSize: theme.fontSize.body, color: theme.color.text },
    unreadable: { fontSize: theme.fontSize.body, color: theme.color.error },
    card: {
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 2,
      backgroundColor: theme.color.surface,
    },
    headline: { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold },
    product: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    body: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },
    strong: { fontWeight: theme.fontWeight.bold },
    note: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    flag: {
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm + 4,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
    },
    flagLabel: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold },
    source: {
      maxWidth: "100%",
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm + 4,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.background,
    },
    sourceTitle: { fontSize: theme.fontSize.small, color: theme.color.primary, fontWeight: theme.fontWeight.semibold },
    sourceDomain: { fontSize: theme.fontSize.caption, color: theme.color.textMuted },
    toggle: { alignSelf: "flex-start" },
    recentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    recentName: { flex: 1, fontSize: theme.fontSize.body, color: theme.color.text },
    recentDate: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    disclaimer: { fontSize: theme.fontSize.caption, color: theme.color.textMuted, textAlign: "center" },
  });
