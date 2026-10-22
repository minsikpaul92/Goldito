import { Redirect } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SitterResultCard } from "../../components/SitterResultCard";
import { AlertModal } from "../../components/ui/AlertModal";
import { Button } from "../../components/ui/Button";
import { ChoiceChips } from "../../components/ui/ChoiceChips";
import { ListGroup, ListRow } from "../../components/ui/ListRow";
import { OptionCard } from "../../components/ui/OptionCard";
import { PriceBreakdown } from "../../components/ui/PriceBreakdown";
import { ResultState } from "../../components/ui/ResultState";
import { Screen } from "../../components/ui/Screen";
import { SectionTitle } from "../../components/ui/SectionTitle";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Sheet } from "../../components/ui/Sheet";
import { StepHeader } from "../../components/ui/StepHeader";
import { SummaryRow } from "../../components/ui/SummaryRow";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/**
 * The design-system kit (design site master: ds-status.html): every shared part and its variants on one screen,
 * so design QA happens here once. Only with EXPO_PUBLIC_DEV_ROUTES=1. Sections: ?family=selection|cards|layout|feedback.
 */
const devRoutesEnabled = process.env.EXPO_PUBLIC_DEV_ROUTES === "1";

export default function Kit() {
  if (!devRoutesEnabled) return <Redirect href="/" />;
  return <KitScreen />;
}

function KitScreen() {
  const styles = useThemedStyles(makeStyles);
  const [chips, setChips] = useState<string[]>(["meals"]);
  const [seg, setSeg] = useState<"all" | "max" | "mochi">("all");
  const [pets, setPets] = useState<string[]>(["max", "mochi"]);
  const [stay, setStay] = useState("chloe");
  const [trip, setTrip] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [danger, setDanger] = useState(false);
  const togglePet = (id: string) => setPets((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Screen contentStyle={styles.content} testID="kit">
      <Text style={styles.eyebrow}>SELECTION</Text>
      <SectionTitle>Chips</SectionTitle>
      <ChoiceChips
        options={[{ value: "all", label: "All" }, { value: "meals", label: "Meals" }, { value: "walks", label: "Walks" }, { value: "naps", label: "Naps" }]}
        value={chips}
        onChange={setChips}
        multi
        testID="kit-chips"
      />
      <SegmentedControl
        options={[{ value: "all", label: "All" }, { value: "max", label: "Max" }, { value: "mochi", label: "Mochi" }]}
        value={seg}
        onChange={setSeg}
        testID="kit-seg"
      />
      <SectionTitle>Option cards</SectionTitle>
      <OptionCard title="Max" detail="Dog · Maltese · 4 years" selected={pets.includes("max")} onPress={() => togglePet("max")} multi testID="kit-opt-max" />
      <OptionCard title="Mochi" detail="Cat · Domestic shorthair · 3 years" selected={pets.includes("mochi")} onPress={() => togglePet("mochi")} multi testID="kit-opt-mochi" />
      <OptionCard title="At Chloe's home" detail="Boarding · $55 a night" selected={stay === "chloe"} onPress={() => setStay("chloe")} testID="kit-opt-chloe" />
      <OptionCard title="At my home" detail="House sitting · $70 a night" selected={stay === "mine"} onPress={() => setStay("mine")} testID="kit-opt-mine" />
      <SectionTitle>Buttons</SectionTitle>
      <Button label="Next" size="large" onPress={() => undefined} testID="kit-next" />
      <View style={styles.row}>
        <Button label="Primary" onPress={() => undefined} style={styles.flex} />
        <Button label="Secondary" variant="secondary" onPress={() => undefined} style={styles.flex} />
      </View>
      <Button label="Disabled" disabled onPress={() => undefined} />

      <Text style={styles.eyebrow}>CARDS</Text>
      <SectionTitle>Sitter results</SectionTitle>
      <SitterResultCard name="Chloe" meta="5 yrs experience" km="2 km" nightly={55} favorite onOpen={() => undefined} testID="kit-sitter-chloe" />
      <SitterResultCard name="Jun" meta="3 yrs experience" km="3 km" nightly={60} onOpen={() => undefined} testID="kit-sitter-jun" />
      <SitterResultCard name="Ari" km="4 km" nightly={null} onOpen={() => undefined} testID="kit-sitter-ari" />
      <SectionTitle>Price</SectionTitle>
      <PriceBreakdown
        lines={[{ label: "3 nights × $55.00", amount: "$165.00" }, { label: "Second pet (Mochi), +50%", amount: "+$82.50" }, { label: "Thanksgiving, Oct 12, +25%", amount: "+$20.63" }]}
        total="$268.13 CAD"
        note="All fees included"
        testID="kit-price"
      />

      <Text style={styles.eyebrow}>LAYOUT</Text>
      <StepHeader flow="Booking request" step={1} total={6} onBack={() => undefined} help={{ label: "Ask Chloe", onPress: () => undefined }} testID="kit-step" />
      <SectionTitle>List rows</SectionTitle>
      <ListGroup>
        <ListRow title="What's new" detail="Snap, live trips, photo requests" trailing={{ kind: "badge", text: "3 new" }} onPress={() => undefined} />
        <ListRow title="Name" detail="Robert Park" onPress={() => undefined} />
        <ListRow title="Trip updates" detail="On the way, arrived" trailing={{ kind: "switch", value: trip, onChange: setTrip }} />
        <ListRow title="Privacy" onPress={() => undefined} />
        <ListRow title="Sign out" danger onPress={() => undefined} />
      </ListGroup>
      <SectionTitle>Summary rows</SectionTitle>
      <View>
        <SummaryRow label="Pets" value="Max and Mochi" onChange={() => undefined} />
        <SummaryRow label="Dates" value="Oct 9 to 12" detail="3 nights" onChange={() => undefined} />
        <SummaryRow label="Drop-off" value="Chloe drives" detail="Fri, Oct 9, 7:30 AM" onChange={() => undefined} />
      </View>

      <Text style={styles.eyebrow}>FEEDBACK</Text>
      <View style={styles.row}>
        <Button label="Open a sheet" variant="secondary" onPress={() => setSheet(true)} style={styles.flex} testID="kit-open-sheet" />
        <Button label="Danger modal" variant="secondary" onPress={() => setDanger(true)} style={styles.flex} testID="kit-open-danger" />
      </View>
      <View style={styles.result}>
        <ResultState title="Request sent" message="Chloe usually replies within an hour. We'll tell you when she does." action={{ label: "Tell Chloe how to care for them", onPress: () => undefined }} testID="kit-result" />
      </View>
      <Sheet visible={sheet} title="Weekly rules" onClose={() => setSheet(false)} footer={<Button label="Apply" onPress={() => setSheet(false)} />} testID="kit-sheet">
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
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
    eyebrow: { marginTop: theme.spacing.lg, fontSize: theme.fontSize.caption, fontWeight: theme.fontWeight.bold, letterSpacing: 1, color: theme.color.textMuted },
    row: { flexDirection: "row", gap: theme.spacing.sm },
    flex: { flex: 1 },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    result: { minHeight: 320, backgroundColor: theme.color.surface, borderRadius: theme.radius.lg },
  });
