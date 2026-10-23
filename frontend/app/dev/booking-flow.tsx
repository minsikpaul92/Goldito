import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { ChoiceChips } from "../../components/ui/ChoiceChips";
import { OptionCard } from "../../components/ui/OptionCard";
import { PriceBreakdown } from "../../components/ui/PriceBreakdown";
import { ResultState } from "../../components/ui/ResultState";
import { StepHeader } from "../../components/ui/StepHeader";
import { SummaryRow } from "../../components/ui/SummaryRow";
import { sectionTitleStyle } from "../../components/ui/SectionTitle";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/**
 * The step-by-step booking request (design site: steps.html "Booking request · 1 of 6"), built only from kit parts.
 * A playable sketch for the product decision: nothing is sent or saved, prices are sample numbers. EXPO_PUBLIC_DEV_ROUTES=1.
 */
const devRoutesEnabled = process.env.EXPO_PUBLIC_DEV_ROUTES === "1";
const TOTAL = 6;

type Answers = { pets: string[]; place: "chloe" | "mine"; dates: string; drop: "owner" | "sitter"; dropTime: string; pick: "owner" | "sitter"; pickTime: string };
const DATES: Record<string, { label: string; nights: number }> = {
  thanksgiving: { label: "Oct 9 to 12", nights: 3 },
  weekend: { label: "Oct 23 to 25", nights: 2 },
  week: { label: "Oct 23 to 30", nights: 7 },
};
const TIMES = ["7:00 AM", "7:30 AM", "8:00 AM", "9:00 AM", "5:00 PM", "6:00 PM"];

export default function BookingFlow() {
  if (!devRoutesEnabled) return <Redirect href="/" />;
  return <Flow />;
}

function Flow() {
  const styles = useThemedStyles(makeStyles);
  const [step, setStep] = useState(1);
  const [sent, setSent] = useState(false);
  const [a, setA] = useState<Answers>({ pets: ["max", "mochi"], place: "chloe", dates: "thanksgiving", drop: "sitter", dropTime: "7:30 AM", pick: "owner", pickTime: "5:00 PM" });
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((x) => ({ ...x, [k]: v }));
  const nights = DATES[a.dates].nights;
  const rate = a.place === "chloe" ? 55 : 70;
  const base = nights * rate;
  const second = a.pets.length > 1 ? base * 0.5 : 0;
  const money = (n: number) => `$${n.toFixed(2)}`;
  const canNext = step !== 1 || a.pets.length > 0;

  if (sent) {
    return (
      <View style={styles.root}>
        <ResultState
          title="Request sent"
          message="Chloe usually replies within an hour. We'll tell you when she does."
          action={{ label: "Tell Chloe how to care for them", onPress: () => router.back() }}
          testID="flow-sent"
        />
      </View>
    );
  }

  const q = (title: string, hint?: string) => (
    <View style={styles.q}>
      <Text accessibilityRole="header" style={styles.question}>
        {title}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <StepHeader flow="Booking request" step={step} total={TOTAL} onBack={step > 1 ? () => setStep(step - 1) : undefined} help={{ label: "Ask Chloe", onPress: () => undefined }} testID="flow-step" />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            {q("Who is staying with Chloe?", "Pick one or both.")}
            <OptionCard title="Max" detail="Dog · Maltese · 4 years · allergic to chicken" multi selected={a.pets.includes("max")} onPress={() => set("pets", a.pets.includes("max") ? a.pets.filter((p) => p !== "max") : [...a.pets, "max"])} testID="flow-pet-max" />
            <OptionCard title="Mochi" detail="Cat · Domestic shorthair · 3 years" multi selected={a.pets.includes("mochi")} onPress={() => set("pets", a.pets.includes("mochi") ? a.pets.filter((p) => p !== "mochi") : [...a.pets, "mochi"])} testID="flow-pet-mochi" />
          </>
        ) : null}
        {step === 2 ? (
          <>
            {q(`Where should ${a.pets.length > 1 ? "they" : "your pet"} stay?`)}
            <OptionCard title="At Chloe's home" detail="Boarding · $55 a night" selected={a.place === "chloe"} onPress={() => set("place", "chloe")} />
            <OptionCard title="At my home" detail="House sitting · Chloe comes to you · $70 a night" selected={a.place === "mine"} onPress={() => set("place", "mine")} />
          </>
        ) : null}
        {step === 3 ? (
          <>
            {q("Which days?")}
            <OptionCard title="Thanksgiving weekend" detail="Fri, Oct 9 to Mon, Oct 12 · 3 nights" selected={a.dates === "thanksgiving"} onPress={() => set("dates", "thanksgiving")} />
            <OptionCard title="The weekend after" detail="Fri, Oct 23 to Sun, Oct 25 · 2 nights" selected={a.dates === "weekend"} onPress={() => set("dates", "weekend")} />
            <OptionCard title="A week" detail="Oct 23 to 30 · 7 nights" selected={a.dates === "week"} onPress={() => set("dates", "week")} />
          </>
        ) : null}
        {step === 4 ? (
          <>
            {q(`How do they get to ${a.place === "chloe" ? "Chloe's" : "the stay"}?`, `Drop-off · ${DATES[a.dates].label.split(" to ")[0]}`)}
            <OptionCard title="I'll drive them over" selected={a.drop === "owner"} onPress={() => set("drop", "owner")} />
            <OptionCard title="Chloe picks them up" detail="From your home" selected={a.drop === "sitter"} onPress={() => set("drop", "sitter")} />
            <Text style={styles.label}>What time?</Text>
            <ChoiceChips options={TIMES.slice(0, 4).map((t) => ({ value: t, label: t }))} value={[a.dropTime]} onChange={(v) => v[0] && set("dropTime", v[0])} />
          </>
        ) : null}
        {step === 5 ? (
          <>
            {q("And the way home?", `Pick-up · ${DATES[a.dates].label.split(" to ")[1]}`)}
            <OptionCard title="I'll pick them up" selected={a.pick === "owner"} onPress={() => set("pick", "owner")} />
            <OptionCard title="Chloe brings them home" selected={a.pick === "sitter"} onPress={() => set("pick", "sitter")} />
            <Text style={styles.label}>What time?</Text>
            <ChoiceChips options={TIMES.slice(4).concat(["12:00 PM", "2:00 PM"]).map((t) => ({ value: t, label: t }))} value={[a.pickTime]} onChange={(v) => v[0] && set("pickTime", v[0])} />
          </>
        ) : null}
        {step === 6 ? (
          <>
            {q("Check your request", "Tap Change to fix anything.")}
            <View>
              <SummaryRow label="Pets" value={a.pets.map((p) => (p === "max" ? "Max" : "Mochi")).join(" and ")} onChange={() => setStep(1)} />
              <SummaryRow label="Stay" value={a.place === "chloe" ? "At Chloe's home" : "At my home"} onChange={() => setStep(2)} />
              <SummaryRow label="Dates" value={DATES[a.dates].label} detail={`${nights} nights`} onChange={() => setStep(3)} />
              <SummaryRow label="Drop-off" value={a.drop === "sitter" ? "Chloe drives" : "You drive"} detail={a.dropTime} onChange={() => setStep(4)} />
              <SummaryRow label="Pick-up" value={a.pick === "owner" ? "You drive" : "Chloe drives"} detail={a.pickTime} onChange={() => setStep(5)} />
            </View>
            <PriceBreakdown
              lines={[{ label: `${nights} nights × ${money(rate)}`, amount: money(base) }, ...(second ? [{ label: "Second pet, +50%", amount: `+${money(second)}` }] : [])]}
              total={`${money(base + second)} CAD`}
              note="Sample numbers · the real quote comes from Chloe's rates"
            />
          </>
        ) : null}
      </ScrollView>
      <View style={styles.foot}>
        <Button
          label={step === TOTAL ? "Send request" : "Next"}
          size="large"
          disabled={!canNext}
          onPress={() => (step === TOTAL ? setSent(true) : setStep(step + 1))}
          testID="flow-next"
        />
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    head: { paddingHorizontal: theme.spacing.md },
    body: { gap: theme.spacing.md, padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
    q: { gap: theme.spacing.xs, marginBottom: theme.spacing.xs },
    question: { ...sectionTitleStyle(theme), fontSize: theme.fontSize.title, lineHeight: theme.lineHeight.title },
    hint: { fontSize: theme.fontSize.body, color: theme.color.textMuted },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted, marginTop: theme.spacing.sm },
    foot: { padding: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.color.border, backgroundColor: theme.color.background },
  });
