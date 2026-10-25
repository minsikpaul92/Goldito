import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { LayoutRectangle, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "../components/ui/Screen";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Section = { title: string; body: string[] };

const slug = (title: string) => title.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

const UPDATED = "October 24, 2026";

const SECTIONS: Section[] = [
  {
    title: "1. About this prototype",
    body: [
      "Goldito is a pet-care prototype developed for the Nebius x NVIDIA Global AI Hackathon. It is created for demonstration and judging purposes.",
      "Payments and bookings within this app use mock data. Please do not submit real payment details or confidential credentials.",
    ],
  },
  {
    title: "2. Pet care and responsibilities",
    body: [
      "Pet owners are responsible for providing accurate health, allergy, dietary, and behavioral notes for each pet.",
      "Sitters agree to review all pet care instructions and follow agreed-upon routines during bookings and transit.",
      "The Meet & Greet step is intended to ensure mutual comfort and pet compatibility before any care begins.",
    ],
  },
  {
    title: "3. AI suggestions and veterinary disclaimer",
    body: [
      "Goldito provides AI-assisted drafts for chat replies, daily reports, care plans, and treat checks using NVIDIA Nemotron and open-source models.",
      "AI outputs are helpful suggestions and do not constitute veterinary, medical, or professional behavioral advice.",
      "All AI-generated messages and daily reports require human review and approval before being sent, unless auto-send has been explicitly enabled.",
    ],
  },
  {
    title: "4. User content and photos",
    body: [
      "Users retain rights to the photos and updates they share in Goldito.",
      "By uploading photos, you confirm that you have the right to share them and that they do not infringe on the privacy or intellectual property of others.",
    ],
  },
  {
    title: "5. Service availability and changes",
    body: [
      "Because Goldito is an active hackathon demonstration, features and data may be modified, reset, or updated as development continues.",
      "For inquiries or bug reports, please refer to the project repository at github.com/minsikpaul92/Goldito.",
    ],
  },
];

export default function Terms() {
  const styles = useThemedStyles(makeStyles);
  const { open: openParam } = useLocalSearchParams<{ open?: string }>();
  const [open, setOpen] = useState<string | undefined>(
    SECTIONS.some((section) => slug(section.title) === openParam) ? openParam : slug(SECTIONS[0].title),
  );
  const scrollRef = useRef<ScrollView>(null);
  const sectionLayouts = useRef<Record<string, LayoutRectangle>>({});
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!open) return;

    const timer = setTimeout(() => {
      const layout = sectionLayouts.current[open];
      if (layout) {
        scrollRef.current?.scrollTo({ y: Math.max(0, layout.y - 16), animated: true });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [open]);

  return (
    <Screen ref={scrollRef} contentStyle={styles.content} testID="terms">
      <Text accessibilityRole="header" style={styles.title}>
        Terms of Service
      </Text>
      <Text style={styles.updated}>Last updated {UPDATED}</Text>
      {SECTIONS.map((section) => {
        const id = slug(section.title);
        const expanded = open === id;
        return (
          <View
            key={id}
            onLayout={(e) => {
              sectionLayouts.current[id] = e.nativeEvent.layout;
            }}
            style={styles.section}
            testID={`terms-${id}`}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? undefined : id)}
              style={styles.headingRow}
              testID={`terms-${id}-toggle`}
            >
              <Text accessibilityRole="header" style={styles.heading}>
                {section.title}
              </Text>
              <Text style={styles.chevron}>{expanded ? "▾" : "▸"}</Text>
            </Pressable>
            <View style={expanded ? styles.body : styles.bodyClosed}>
              {section.body.map((paragraph) => (
                <Text key={paragraph} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
    title: { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    updated: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    section: { borderBottomWidth: 1, borderBottomColor: theme.color.border, paddingBottom: theme.spacing.sm },
    headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
    heading: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text, flexShrink: 1 },
    chevron: { fontSize: theme.fontSize.body, color: theme.color.textMuted },
    body: { gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
    bodyClosed: { display: "none" },
    paragraph: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },
  });
