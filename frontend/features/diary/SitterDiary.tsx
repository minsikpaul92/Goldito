import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ALL_PETS, FeedPetPicker } from "../../components/FeedPetPicker";
import { FeedBarRight } from "../../components/FeedSwitch";
import { BackLink } from "../../components/ui/BackLink";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { ReportComposer, type ReportStatus, type SendBar } from "../../components/ReportComposer";
import { HOME_TEXT } from "../../components/home/homeType";
import { useCaringPets } from "../care/useCaringPets";
import { usePetFaces } from "../feed/usePetFaces";
import { DiaryBook } from "./DiaryBook";
import { PageActions } from "./PageActions";
import { SentReport, listBookPages } from "./reportApi";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

const STATUS_LABEL: Record<NonNullable<ReportStatus>, string> = { sent: "Sent ✓", draft: "Draft" };

type View_ = "today" | "book";

/**
 * Sitter Diary (D47b · Diary book): opens on the **Book** like the owner's, with Write a page above it. **Today** — the page for each pet in care, written by hand or by Goldito from the
 * day's chips, checked and sent (phase-07 7.3; each composer keeps its page while switching pets, FB-19). **Book** —
 * every page this sitter sent, all pets they have cared for or one, oldest → newest.
 * One row of controls (#398): the pet chip and Book sit at the right of the Photos / Diary tabs, and Send floats at the
 * bottom of the screen while the page and chips scroll.
 */
export function SitterDiary() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { state, reload } = useCaringPets();
  const [selected, setSelected] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ReportStatus>>({});
  const [bars, setBars] = useState<Record<string, SendBar | null>>({});
  const caring = state.status === "ready" ? state.pets : [];
  const faces = usePetFaces(caring.map((p) => p.id));
  // A Feed diary cell opens the book on its page (`?page=`).
  const { page: pageParam } = useLocalSearchParams<{ page?: string }>();
  const [view, setView] = useState<View_ | null>(null);
  useEffect(() => {
    if (pageParam) setView("book");
  }, [pageParam]);
  // The book first, as the owner's Diary does; Write a page opens today's page.
  const shownView: View_ = view ?? "book";
  // A page deleted in the book: the Today cards start again (their "sent" state is stale).
  const [deleted, setDeleted] = useState(0);
  // A pet whose unsent page was cancelled starts again (only that pet's composer).
  const [resets, setResets] = useState<Record<string, number>>({});
  const [pages, setPages] = useState<SentReport[] | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  // The book's own pet picker (All pets, or one): the pets that have pages.
  const [bookPet, setBookPet] = useState<string>(ALL_PETS);
  const bookPets = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; species: "dog" | "cat" }>();
    for (const page of pages ?? []) if (!seen.has(page.petId)) seen.set(page.petId, { id: page.petId, name: page.petName, species: page.species });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [pages]);
  const bookFaces = usePetFaces(bookPets.map((p) => p.id));
  const onStatus = useCallback(
    (petId: string) => (status: ReportStatus) => setStatuses((prev) => (prev[petId] === status ? prev : { ...prev, [petId]: status })),
    [],
  );
  // One stable setter per pet: a composer tells which Send it needs, the screen pins it at the bottom.
  const barSetters = useRef(new Map<string, (bar: SendBar | null) => void>());
  const onSendBar = (petId: string) => {
    let set = barSetters.current.get(petId);
    if (!set) {
      set = (bar) => setBars((prev) => ({ ...prev, [petId]: bar }));
      barSetters.current.set(petId, set);
    }
    return set;
  };

  const loadBook = useCallback(async () => {
    try {
      setPages(await listBookPages());
      setBookError(null);
    } catch (e) {
      setBookError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void loadBook();
    }, [loadBook]),
  );
  // A page just sent belongs in the book right away.
  const sentCount = Object.values(statuses).filter((s) => s === "sent").length;
  useFocusEffect(
    useCallback(() => {
      void loadBook();
    }, [sentCount, loadBook]),
  );

  if (state.status === "loading") return <LoadingView />;
  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState
          emoji="📔"
          title="Couldn't load your pets"
          message={state.message}
          action={{ label: "Try again", onPress: () => void reload() }}
        />
      </Screen>
    );
  }
  const current = caring.find((p) => p.id === selected) ?? caring[0];
  const bar = shownView === "today" && current ? bars[current.id] : null;
  const hints = Object.fromEntries(
    Object.entries(statuses).flatMap(([id, s]) => (s ? [[id, STATUS_LABEL[s]]] : [])),
  ) as Record<string, string>;

  return (
    <Screen
      testID="sitter-diary-screen"
      contentStyle={{ gap: 12 }}
      scrollbar
      footer={
        bar && current ? (
          // Cancel and Send, each half the row: Cancel drops everything on the page (the AI draft too) and goes back.
          <View style={styles.footerRow}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.half}
              onPress={() => {
                // The draft on the server goes first: a page started again would otherwise read it back.
                void bar.discard().then(() => {
                  setResets((prev) => ({ ...prev, [current.id]: (prev[current.id] ?? 0) + 1 }));
                  setView("book");
                });
              }}
              testID={`report-cancel-${current.id}`}
            />
            <Button label={bar.label} disabled={bar.disabled} onPress={bar.onPress} style={styles.half} testID={`report-send-${current.id}`} />
          </View>
        ) : undefined
      }
    >
      <FeedBarRight
        signature={`${shownView}|${current?.id}|${bookPet}|${caring.map((p) => p.id).join(",")}|${bookPets.map((p) => p.id).join(",")}|${JSON.stringify(hints)}|${JSON.stringify(faces)}|${JSON.stringify(bookFaces)}`}
      >
        {shownView === "today" && caring.length > 1 ? (
          <FeedPetPicker
            groups={[{ key: "caring", pets: caring }]}
            allPets={[]}
            value={current?.id ?? ""}
            onChange={setSelected}
            faces={faces}
            hints={hints}
            testID="diary-pet"
          />
        ) : null}
        {shownView === "book" && bookPet !== ALL_PETS ? (
          <FeedPetPicker
            groups={[{ key: "book", pets: bookPets }]}
            allPets={[]}
            value={bookPet}
            onChange={setBookPet}
            faces={bookFaces}
            testID="diary-book-pet"
          />
        ) : null}
        {shownView === "today" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Diary book"
            onPress={() => {
              setView("book");
              void loadBook();
            }}
            style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
            testID="sitter-diary-view-book"
          >
            <Icon name="diary" size={16} color={theme.color.text} />
            <Text style={styles.toggleText}>Book</Text>
          </Pressable>
        ) : null}
      </FeedBarRight>

      {shownView === "book" && (caring.length > 0 || bookPet !== ALL_PETS) ? (
        // ← (one pet's pages back to the covers) sits left of Write a page: the one Back control (DESIGN.md §7.8).
        <View style={styles.writeRow}>
          {bookPet !== ALL_PETS ? <BackLink onPress={() => setBookPet(ALL_PETS)} testID="sitter-book-covers" /> : null}
          {caring.length > 0 ? (
            <Button label="Write a page" variant="secondary" onPress={() => setView("today")} style={styles.writeFill} testID="sitter-diary-view-today" />
          ) : null}
        </View>
      ) : null}
      {shownView === "today" && caring.length === 0 ? (
        <EmptyState emoji="📔" title="Diary" message="When you're caring for a pet, you can write and send the day's page from here." />
      ) : null}
      {caring.map((pet) => (
        // Every pet's composer stays mounted (its chips, lines and page survive switching); only the picked one shows.
        <View key={pet.id} style={shownView === "today" && pet.id === current?.id ? undefined : styles.hidden}>
          <ReportComposer key={`${deleted}-${resets[pet.id] ?? 0}`} pet={pet} onStatus={onStatus(pet.id)} onSendBar={onSendBar(pet.id)} />
        </View>
      ))}

      {shownView === "book" ? (
        pages === null && !bookError ? (
          <LoadingView />
        ) : bookError && !pages ? (
          <EmptyState emoji="📔" title="Couldn't load the diary" message={bookError} action={{ label: "Try again", onPress: () => void loadBook() }} />
        ) : !pages || pages.length === 0 ? (
          <EmptyState emoji="📔" title="No pages yet" message="Every page you send collects here, one pet at a time or all together." />
        ) : (
          <DiaryBook
            key={pageParam ?? "book"}
            pages={pages}
            initialId={pageParam}
            selectedPet={bookPet === ALL_PETS ? null : bookPet}
            onPetChange={(id) => setBookPet(id ?? ALL_PETS)}
            footer={(page) => (
              <PageActions
                reportId={page.id}
                action="delete"
                other="The owner"
                onDone={() => {
                  setDeleted((n) => n + 1);
                  void loadBook();
                }}
              />
            )}
            testID="sitter-book"
          />
        )
      ) : null}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    toggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      minHeight: 40,
      paddingHorizontal: 10,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    toggleText: { fontSize: HOME_TEXT.chip, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    pressed: { opacity: 0.6 },
    hidden: { display: "none" },
    footerRow: { flexDirection: "row", gap: theme.spacing.sm },
    half: { flex: 1 },
    writeRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    writeFill: { flex: 1 },
  });
