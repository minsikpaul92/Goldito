import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { LayoutRectangle, ScrollView, StyleSheet, Text, View } from "react-native";

import { Collapsible } from "./ui/Collapsible";
import { Screen } from "./ui/Screen";
import { ScreenSubtitle } from "./ui/ScreenHeader";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type LegalSection = { title: string; body: string[] };

export const legalSlug = (title: string) => title.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

type Props = {
  title: string;
  updated: string;
  sections: LegalSection[];
  /** testID of the page; each section is `${testID}-${slug}`, its header `${testID}-${slug}-toggle`. */
  testID: string;
};

/**
 * Privacy and Terms (10.11, #375): the title in the stack header, its date, then one card per section. Sections open one at a
 * time; closed ones stay in the page, hidden, so the text is still there for crawlers and tests.
 * `?open=<slug>` opens that section (the Google consent-screen reviewer lands on Google Calendar and Meet).
 */
export function LegalPage({ title, updated, sections, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { open: openParam } = useLocalSearchParams<{ open?: string }>();
  const [open, setOpen] = useState<string | undefined>(
    sections.some((section) => legalSlug(section.title) === openParam) ? openParam : legalSlug(sections[0].title),
  );
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef<Record<string, LayoutRectangle>>({});
  const firstRender = useRef(true);

  // Bring a section that was just opened to the top, once its layout has settled.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!open) return;
    const timer = setTimeout(() => {
      const layout = layouts.current[open];
      if (layout) scrollRef.current?.scrollTo({ y: Math.max(0, layout.y - 16), animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <Screen ref={scrollRef} contentStyle={styles.content} testID={testID}>
      <Stack.Screen options={{ title }} />
      <ScreenSubtitle>{`Last updated ${updated}`}</ScreenSubtitle>
      <View style={styles.sections}>
        {sections.map((section) => {
          const id = legalSlug(section.title);
          const expanded = open === id;
          return (
            <View key={id} onLayout={(e) => (layouts.current[id] = e.nativeEvent.layout)}>
              <Collapsible
                title={section.title}
                open={expanded}
                onToggle={() => setOpen(expanded ? undefined : id)}
                keepMounted
                testID={`${testID}-${id}`}
                toggleTestID={`${testID}-${id}-toggle`}
              >
                {section.body.map((paragraph) => (
                  <Text key={paragraph} style={styles.paragraph}>
                    {paragraph}
                  </Text>
                ))}
              </Collapsible>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
    sections: { gap: theme.spacing.sm },
    paragraph: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 24 },
  });
