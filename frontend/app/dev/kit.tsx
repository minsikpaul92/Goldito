import { Redirect, router } from "expo-router";
import { ReactNode, useState } from "react";
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from "react-native";

import { SitterResultCard } from "../../components/SitterResultCard";
import { AlertModal } from "../../components/ui/AlertModal";
import { Button } from "../../components/ui/Button";
import { ChoiceChips } from "../../components/ui/ChoiceChips";
import { EmptyState } from "../../components/ui/EmptyState";
import { List, ListRow } from "../../components/ui/ListRow";
import { OptionCard } from "../../components/ui/OptionCard";
import { Pager } from "../../components/ui/Pager";
import { PriceBreakdown } from "../../components/ui/PriceBreakdown";
import { ResultState } from "../../components/ui/ResultState";
import { SectionTabs, useSectionSpy } from "../../components/ui/SectionTabs";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Sheet } from "../../components/ui/Sheet";
import { Skeleton } from "../../components/ui/Skeleton";
import { Slider } from "../../components/ui/Slider";
import { StepHeader } from "../../components/ui/StepHeader";
import { SummaryRow } from "../../components/ui/SummaryRow";
import { TextButton } from "../../components/ui/TextButton";
import { TextField } from "../../components/ui/TextField";
import { useToast } from "../../providers/ToastProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/**
 * The design kit in the app (master: design site kit.html). Sticky section tabs follow the scroll and jump on tap;
 * every part is live and its states are labelled. Only with EXPO_PUBLIC_DEV_ROUTES=1.
 */
const devRoutesEnabled = process.env.EXPO_PUBLIC_DEV_ROUTES === "1";

const SECTIONS = [
  { key: "navigation", label: "Navigation" },
  { key: "selection", label: "Selection" },
  { key: "inputs", label: "Inputs" },
  { key: "cards", label: "Cards" },
  { key: "layout", label: "Layout" },
  { key: "feedback", label: "Feedback" },
];

export default function Kit() {
  if (!devRoutesEnabled) return <Redirect href="/" />;
  return <KitScreen />;
}

function KitScreen() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const spy = useSectionSpy(SECTIONS.map((s) => s.key));
  const [chips, setChips] = useState<string[]>(["meals"]);
  const [seg, setSeg] = useState<"chats" | "requests" | "past">("chats");
  const [pets, setPets] = useState<string[]>(["max"]);
  const [stay, setStay] = useState("chloe");
  const [step, setStep] = useState(1);
  const [km, setKm] = useState(5);
  const [trip, setTrip] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [danger, setDanger] = useState(false);
  const togglePet = (id: string) => setPets((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const save = () => {
    setSaving(true);
    setTimeout(() => (setSaving(false), toast.show("Saved")), 1400);
  };

  return (
    <ScrollView
      ref={spy.scroll}
      stickyHeaderIndices={[0]}
      onScroll={spy.onScroll}
      scrollEventThrottle={32}
      style={styles.root}
      contentContainerStyle={styles.content}
      testID="kit"
    >
      <SectionTabs sections={SECTIONS} active={spy.active} onPick={spy.jump} testID="kit-tabs" />

      <Section id="navigation" title="NAVIGATION" onLayout={spy.onSectionLayout("navigation")}>
        <SectionTitle>Step header</SectionTitle>
        <StepHeader flow="Booking request" step={step} total={6} onBack={step > 1 ? () => setStep(step - 1) : undefined} help={{ label: "Ask Chloe", onPress: () => undefined }} testID="kit-step" />
        <View style={styles.row}>
          <Button label="Back" variant="secondary" onPress={() => setStep(Math.max(1, step - 1))} style={styles.flex} />
          <Button label="Next step" onPress={() => setStep(Math.min(6, step + 1))} style={styles.flex} testID="kit-step-next" />
        </View>
        <SectionTitle>Pages</SectionTitle>
        <View style={styles.pager}>
          <Pager pages={[1, 2, 3].map((n) => ({ label: `Page ${n}`, content: <View style={styles.page}><Text style={styles.body}>{`Page ${n}: swipe or tap a dot`}</Text></View> }))} testID="kit-pager" />
        </View>
        <Text style={styles.hint}>The tabs above this screen are SectionTabs: they follow the scroll and jump when tapped.</Text>
      </Section>

      <Section id="selection" title="SELECTION" onLayout={spy.onSectionLayout("selection")}>
        <SectionTitle>Chips</SectionTitle>
        <State label="Live">
          <ChoiceChips
            options={[{ value: "all", label: "All" }, { value: "meals", label: "Meals" }, { value: "walks", label: "Walks" }, { value: "grooming", label: "Grooming", disabled: true }]}
            value={chips}
            onChange={setChips}
            multi
            testID="kit-chips"
          />
        </State>
        <State label="Segments">
          <SegmentedControl
            options={[{ value: "chats", label: "Chats" }, { value: "requests", label: "Requests", count: 2 }, { value: "past", label: "Past" }]}
            value={seg}
            onChange={setSeg}
            testID="kit-seg"
          />
        </State>
        <SectionTitle>Option cards</SectionTitle>
        <OptionCard title="Max" detail="Dog · Maltese · 4 years" selected={pets.includes("max")} onPress={() => togglePet("max")} multi testID="kit-opt-max" />
        <OptionCard title="Mochi" detail="Cat · Domestic shorthair · 3 years" selected={pets.includes("mochi")} onPress={() => togglePet("mochi")} multi testID="kit-opt-mochi" />
        <OptionCard title="At Chloe's home" detail="Boarding · $55 a night" selected={stay === "chloe"} onPress={() => setStay("chloe")} testID="kit-opt-chloe" />
        <OptionCard title="At my home" detail="House sitting · $70 a night" selected={stay === "mine"} onPress={() => setStay("mine")} testID="kit-opt-mine" />
        <OptionCard title="Drop-in visits" detail="Chloe doesn't offer this" selected={false} disabled onPress={() => undefined} testID="kit-opt-dropin" />
        <SectionTitle>Buttons</SectionTitle>
        <State label="Large">
          <Button label="Next" size="large" onPress={() => undefined} testID="kit-next" />
        </State>
        <State label="Primary">
          <Button label={saving ? "Saving…" : "Tap to save"} loading={saving} onPress={save} testID="kit-save" />
        </State>
        <State label="Secondary">
          <Button label="Cancel" variant="secondary" onPress={() => undefined} />
        </State>
        <State label="Danger">
          <Button label="Sign out" variant="danger" onPress={() => undefined} />
        </State>
        <State label="Text">
          <TextButton label="Change" onPress={() => undefined} />
        </State>
        <State label="Disabled">
          <Button label="Pick a pet first" disabled onPress={() => undefined} />
        </State>
      </Section>

      <Section id="inputs" title="INPUTS" onLayout={spy.onSectionLayout("inputs")}>
        <SectionTitle>Text field</SectionTitle>
        <TextField label="Name" placeholder="Max" />
        <TextField label="Breed" defaultValue="Maltese" />
        <TextField label="Birthday" defaultValue="2026-13-40" error="Use a real date, like 2022-04-15." />
        <TextField label="Species" defaultValue="Dog" editable={false} />
        <SectionTitle>Slider and quick picks</SectionTitle>
        <View style={styles.rowBetween}>
          <Text style={styles.body}>Within</Text>
          <Text style={styles.value}>{`${km} km`}</Text>
        </View>
        <Slider value={km} min={1} max={100} onChange={setKm} label="Distance" valueText={`${km} km`} testID="kit-km" />
        <ChoiceChips
          options={[2, 5, 10, 25].map((k) => ({ value: String(k), label: `${k} km` }))}
          value={[2, 5, 10, 25].includes(km) ? [String(km)] : []}
          onChange={(v) => v[0] && setKm(Number(v[0]))}
          testID="kit-km-quick"
        />
      </Section>

      <Section id="cards" title="CARDS" onLayout={spy.onSectionLayout("cards")}>
        <SectionTitle>Sitter results</SectionTitle>
        <SitterResultCard name="Chloe" meta="5 yrs exp" km="2 km" nightly={55} favorite rating={4.9} stays={38} availability={{ free: true, label: "Free on your dates" }} onOpen={() => undefined} testID="kit-sitter-chloe" />
        <SitterResultCard name="Jun" meta="3 yrs exp" km="3 km" nightly={60} rating={4.8} stays={21} availability={{ free: false, label: "Full on Oct 24" }} onOpen={() => undefined} testID="kit-sitter-jun" />
        <SitterResultCard name="Ari" km="4 km" nightly={null} onOpen={() => undefined} testID="kit-sitter-ari" />
        <SectionTitle>Price</SectionTitle>
        <PriceBreakdown
          lines={[{ label: "3 nights × $55.00", amount: "$165.00" }, { label: "Second pet (Mochi), +50%", amount: "+$82.50" }, { label: "Thanksgiving, Oct 12, +25%", amount: "+$20.63" }]}
          total="$268.13 CAD"
          note="All fees included"
          testID="kit-price"
        />
      </Section>

      <Section id="layout" title="LAYOUT" onLayout={spy.onSectionLayout("layout")}>
        <SectionTitle>List rows</SectionTitle>
        <List>
          <ListRow title="What's new" subtitle="Snap, live trips, photo requests" badge="3 new" onPress={() => undefined} />
          <ListRow title="Robert Park" subtitle="robert@example.com · Pet owner" onPress={() => undefined} />
          <ListRow title="Trip updates" subtitle="On the way, arrived" switchValue={trip} onSwitchChange={setTrip} />
          <ListRow title="Privacy" onPress={() => undefined} />
          <ListRow title="Phone notifications" subtitle="Not available yet" />
          <ListRow title="Sign out" tone="danger" onPress={() => undefined} />
        </List>
        <SectionTitle>Summary rows</SectionTitle>
        <View>
          <SummaryRow label="Pets" value="Max and Mochi" onChange={() => undefined} />
          <SummaryRow label="Dates" value="Oct 9 to 12" detail="3 nights" onChange={() => undefined} />
          <SummaryRow label="Drop-off" value="Chloe drives" detail="Fri, Oct 9, 7:30 AM" onChange={() => undefined} />
        </View>
      </Section>

      <Section id="feedback" title="FEEDBACK" onLayout={spy.onSectionLayout("feedback")}>
        <View style={styles.row}>
          <Button label="Open a sheet" variant="secondary" onPress={() => setSheet(true)} style={styles.flex} testID="kit-open-sheet" />
          <Button label="DANGER" variant="secondary" onPress={() => setDanger(true)} style={styles.flex} testID="kit-open-danger" />
        </View>
        <View style={styles.row}>
          <Button label="Toast" variant="secondary" onPress={() => toast.show("Request sent to Chloe")} style={styles.flex} testID="kit-toast" />
          <Button label="With Undo" variant="secondary" onPress={() => toast.show("Chat with Daniel left", { undo: () => toast.show("Chat is back") })} style={styles.flex} testID="kit-toast-undo" />
          <Button label="Error" variant="secondary" onPress={() => toast.show("Couldn't send. Check your connection.", { tone: "error" })} style={styles.flex} testID="kit-toast-error" />
        </View>
        <View style={styles.card}>
          <ResultState title="Request sent" message="Chloe usually replies within an hour. We'll tell you when she does." action={{ label: "Tell Chloe how to care for them", onPress: () => undefined }} testID="kit-result" />
        </View>
        <SectionTitle>Loading</SectionTitle>
        <Skeleton kind="lines" />
        <Skeleton kind="card" />
        <Skeleton kind="block" />
        <Button label="Play the booking flow" variant="secondary" onPress={() => router.push("/dev/booking-flow")} testID="kit-flow" />
        <View style={styles.card}>
          <EmptyState emoji="📸" title="No posts yet" message="Your sitter will share photos here." action={{ label: "Open History", onPress: () => undefined }} />
        </View>
      </Section>

      <Sheet visible={sheet} title="Weekly rules" onClose={() => setSheet(false)} footer={<Button label="Apply" size="large" onPress={() => setSheet(false)} />} testID="kit-sheet">
        <Text style={styles.body}>Tap the slots you never take.</Text>
        <ChoiceChips options={[{ value: "mon", label: "Mon" }, { value: "tue", label: "Tue" }, { value: "wed", label: "Wed" }]} value={["tue"]} onChange={() => undefined} />
      </Sheet>
      <AlertModal
        visible={danger}
        title="Contains chicken: Max is allergic"
        message="Don't give Max this treat. Chicken is in the ingredients and on his allergy list."
        chips={["Chicken", "Chicken fat"]}
        actionLabel="I understand, don't feed"
        onAcknowledge={() => setDanger(false)}
        testID="kit-danger"
      />
    </ScrollView>
  );
}

function Section({ id, title, onLayout, children }: { id: string; title: string; onLayout: (e: LayoutChangeEvent) => void; children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View onLayout={onLayout} style={styles.section} testID={`kit-${id}`}>
      <Text style={styles.family}>{title}</Text>
      {children}
    </View>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.state}>
      <Text style={styles.stateLabel}>{label}</Text>
      <View style={styles.stateBody}>{children}</View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    content: { paddingBottom: theme.spacing.xl * 3 },
    section: { gap: theme.spacing.md, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.lg },
    family: { fontSize: theme.fontSize.caption, fontWeight: theme.fontWeight.bold, letterSpacing: 1, color: theme.color.textMuted },
    state: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    stateLabel: { width: 72, fontSize: theme.fontSize.caption, fontWeight: theme.fontWeight.bold, color: theme.color.textMuted },
    stateBody: { flex: 1 },
    row: { flexDirection: "row", gap: theme.spacing.sm },
    rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    flex: { flex: 1 },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    value: { fontFamily: theme.fontFamily.display, fontSize: theme.fontSize.option, color: theme.color.text },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    pager: { height: 140, borderRadius: theme.radius.lg, overflow: "hidden", backgroundColor: theme.color.surface },
    page: { flex: 1, alignItems: "center", justifyContent: "center" },
    card: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg },
  });
