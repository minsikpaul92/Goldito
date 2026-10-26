import { router } from "expo-router";
import { ReactNode, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { Art } from "../../../components/art/Art";
import { DemoSheet } from "../../../components/intro/DemoSheet";
import { BackLink } from "../../../components/ui/BackLink";
import { Button } from "../../../components/ui/Button";
import { Icon } from "../../../components/ui/Icon";
import { Screen } from "../../../components/ui/Screen";
import { TextButton } from "../../../components/ui/TextButton";
import { DEFAULT_DEMO_SET, isDemoEnabled } from "../../../lib/demo";
import { useTheme, useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

const BREAKFAST = require("../../../assets/demo/mumu/mumu_white_table.jpg");
const WALK = require("../../../assets/demo/mumu/mumu_lake_walk.jpg");
const COIN = require("../../../assets/brand/goldito-symbol-256.png");

type Story = { title: string; body: string; block: "blockPeach" | "blockMint" | "blockButter"; visual: () => ReactNode };

/**
 * How it works (OB.2, intro trial): three pages from the onboarding plan, the problem, the two sides and one stay,
 * drawn with the app's own pictures. It replaces the owner and sitter tours.
 */
export default function HowItWorks() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [index, setIndex] = useState(0);
  const [demoOpen, setDemoOpen] = useState(false);
  const { owner, sitter, pets } = DEFAULT_DEMO_SET;
  const pet = pets[0];

  const stories: Story[] = [
    {
      title: `No more “how's ${pet}?”`,
      body: "Photos, meals and meds arrive as they happen. You never have to ask your sitter.",
      block: "blockPeach",
      visual: () => (
        <>
          <View style={styles.asks}>
            {[`How's ${pet}?`, "Did he eat?", "Any photos??"].map((q) => (
              <Text key={q} style={styles.ask}>
                {q}
              </Text>
            ))}
          </View>
          <FeedCard photo={BREAKFAST} title="Breakfast, every bite" meta={`${sitter.name} · 8:12 AM · ${pet}`} />
          <FeedCard photo={WALK} title="Walk, 20 minutes" meta={`${sitter.name} · 9:40 AM · ${pet}`} />
        </>
      ),
    },
    {
      title: "Two sides, one app",
      body: "Owners learn without asking. Sitters care, snap and tap: no report essays.",
      block: "blockMint",
      visual: () => (
        <>
          <Who initial={sitter.name[0]} text={`${sitter.name}, the sitter: care, snap, tap`} />
          <View style={styles.tasks}>
            {[["Meal", true], ["Walk", true], ["Nap", false]].map(([label, done]) => (
              <View key={String(label)} style={[styles.task, done ? styles.taskDone : null]}>
                {done ? <Icon name="check" size={14} color={theme.color.primaryText} /> : null}
                <Text style={[styles.taskText, done ? styles.taskTextDone : null]}>{label}</Text>
              </View>
            ))}
            <Art name="owner/camera" size={34} />
          </View>
          <View style={styles.relay} aria-hidden>
            <View style={styles.relayLine} />
            <View style={styles.relayPill}>
              <Image source={COIN} style={styles.relayCoin} />
              <Text style={styles.relayText}>Goldito sends the update</Text>
            </View>
            <View style={styles.relayLine} />
          </View>
          <Who initial={owner.name[0]} text={`${owner.name}, the owner: learns without asking`} />
          <FeedCard photo={BREAKFAST} title={`${pet} ate every bite`} meta={`${sitter.name} · 8:12 AM · just now`} />
        </>
      ),
    },
    {
      title: "A stay with Goldito",
      body: "Everything from the first question to home safe, in one place.",
      block: "blockButter",
      visual: () => (
        <View style={styles.stay}>
          {(
            [
              ["Ask", "A quote in minutes", "bookings/house", "blockPeach"],
              ["Meet", "Care notes become a checklist", "owner/care-bowl", "blockMint"],
              ["Book", "Sign, pay, entry on time", "sitter/pill", "blockBlush"],
              ["Care", "Photos and the daily page", "owner/camera", "blockButter"],
              ["Home safe", `A review and ${pet}'s record`, "owner/pet-dog", "blockMint"],
            ] as const
          ).map(([title, sub, art, block], k, all) => (
            <View key={title} style={styles.stage}>
              <View style={styles.rail}>
                <View style={[styles.node, { backgroundColor: theme.color[block] }]}>
                  <Art name={art} size={26} />
                  <Text style={styles.nodeNumber}>{k + 1}</Text>
                </View>
                {k < all.length - 1 ? <View style={styles.connector} /> : null}
              </View>
              <View style={styles.stageText}>
                <Text style={styles.stageTitle}>{title}</Text>
                <Text style={styles.stageSub}>{sub}</Text>
              </View>
            </View>
          ))}
        </View>
      ),
    },
  ];

  const story = stories[index];
  const last = index === stories.length - 1;

  const footer = (
    <View style={styles.footer}>
      <View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${stories.length}`} testID="how-progress">
        {stories.map((_, k) => (
          <View key={k} style={[styles.dot, k === index && styles.dotOn]} />
        ))}
      </View>
      {last ? (
        <>
          {isDemoEnabled ? <Button label="Try the demo" onPress={() => setDemoOpen(true)} testID="how-demo" /> : null}
          <Button
            label="Create account"
            variant={isDemoEnabled ? "secondary" : "primary"}
            onPress={() => router.push("/signup")}
            testID="how-create"
          />
        </>
      ) : (
        <Button label="Next" onPress={() => setIndex((i) => i + 1)} testID="how-next" />
      )}
    </View>
  );

  return (
    <View style={styles.root} testID="how">
      <Screen contentStyle={styles.content} footer={footer}>
        <View style={styles.top}>
          <BackLink
            onPress={() => (index === 0 ? router.replace("/welcome") : setIndex((i) => i - 1))}
            testID="how-back"
          />
          {!last ? <TextButton label="Skip" onPress={() => setIndex(stories.length - 1)} testID="how-skip" /> : null}
        </View>
        <View style={[styles.visual, { backgroundColor: theme.color[story.block] }]} aria-hidden>
          {story.visual()}
        </View>
        <Text accessibilityRole="header" style={styles.title} testID="how-title">
          {story.title}
        </Text>
        <Text style={styles.body}>{story.body}</Text>
      </Screen>
      <DemoSheet visible={demoOpen} onClose={() => setDemoOpen(false)} />
    </View>
  );

  function FeedCard({ photo, title, meta }: { photo: number; title: string; meta: string }) {
    return (
      <View style={styles.card}>
        <Image source={photo} style={styles.cardPhoto} />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardMeta}>{meta}</Text>
        </View>
      </View>
    );
  }

  function Who({ initial, text }: { initial: string; text: string }) {
    return (
      <View style={styles.who}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.whoText}>{text}</Text>
      </View>
    );
  }
}

const makeStyles = (theme: Theme) => {
  const display = theme.fontFamily.display;
  return StyleSheet.create({
    root: { flex: 1 },
    content: { gap: theme.spacing.md },
    top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 },
    visual: {
      minHeight: 250,
      borderRadius: theme.radius.xl,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      justifyContent: "center",
      overflow: "hidden",
    },
    title: {
      fontSize: theme.fontSize.title + 4,
      lineHeight: theme.fontSize.title + 10,
      color: theme.color.text,
      ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.bold }),
    },
    body: { fontSize: theme.fontSize.body, color: theme.color.textMuted, lineHeight: 22 },
    asks: { alignItems: "flex-end", gap: 4 },
    ask: {
      overflow: "hidden",
      maxWidth: "72%",
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 16,
      borderBottomRightRadius: 4,
      backgroundColor: theme.color.primary,
      color: theme.color.primaryText,
      opacity: 0.6,
      fontSize: theme.fontSize.small,
      fontWeight: theme.fontWeight.semibold,
      textDecorationLine: "line-through",
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: 8,
      borderRadius: 18,
      backgroundColor: theme.color.surface,
    },
    cardPhoto: { width: 44, height: 44, borderRadius: 12 },
    cardText: { flex: 1, gap: 2 },
    cardTitle: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    cardMeta: { fontSize: theme.fontSize.caption + 1, color: theme.color.textMuted },
    who: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.primary,
    },
    avatarText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primaryText },
    whoText: { flex: 1, fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    tasks: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      padding: 10,
      borderRadius: 18,
      backgroundColor: theme.color.surface,
    },
    task: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    taskDone: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
    taskText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    taskTextDone: { color: theme.color.primaryText },
    relay: { alignItems: "center" },
    relayLine: { width: 0, height: 10, borderLeftWidth: 2, borderStyle: "dashed", borderColor: theme.color.primary, opacity: 0.5 },
    relayPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 4,
      paddingRight: 12,
      paddingVertical: 4,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
    },
    // The coin fills about 60% of its canvas (see BrandLogo).
    relayCoin: { width: 28, height: 28, margin: -4 },
    relayText: { fontSize: theme.fontSize.caption + 1, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    stay: { gap: 0 },
    stage: { flexDirection: "row", gap: theme.spacing.md },
    rail: { alignItems: "center", width: 40 },
    node: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    nodeNumber: {
      position: "absolute",
      right: -4,
      top: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      overflow: "hidden",
      textAlign: "center",
      lineHeight: 20,
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.bold,
      backgroundColor: theme.color.primary,
      color: theme.color.primaryText,
    },
    connector: { width: 0, height: 6, borderLeftWidth: 2, borderStyle: "dashed", borderColor: theme.color.primary, opacity: 0.4 },
    stageText: { flex: 1, justifyContent: "center", minHeight: 40 },
    stageTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    stageSub: { fontSize: theme.fontSize.small, color: theme.color.text },
    footer: { gap: theme.spacing.sm },
    dots: { flexDirection: "row", gap: 6, justifyContent: "center", paddingVertical: theme.spacing.xs },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.border },
    dotOn: { width: 22, backgroundColor: theme.color.primary },
  });
};
