import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { AddPhotoSheet } from "../../components/AddPhotoSheet";
import { FeedBrowser } from "../../components/FeedBrowser";
import { FeedPetPicker } from "../../components/FeedPetPicker";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { listSitterBookings } from "../../lib/bookings";
import { UploadError, uploadMedia } from "../../lib/cloudinary";
import {
  FALLBACK_CAPTION,
  FEED_PAGE_SIZE,
  FeedTimelinePost,
  captionPhoto,
  createFeedPost,
  listFeedPosts,
} from "../../lib/feed";
import { PickedMedia, pickMedia } from "../../lib/media";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useNotifications } from "../../providers/NotificationsProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { FeedPet, feedPetsFromBookings } from "./caringPets";

type FeedState =
  | { status: "loading" }
  | { status: "ready"; posts: FeedTimelinePost[]; hasMore: boolean }
  | { status: "error"; message: string; posts: FeedTimelinePost[]; hasMore: boolean };

/**
 * The sitter's Feed tab (#345): it opens on the first pet in care (else the latest pet of a stay that is over) with the
 * same filterable mosaic as the owner's. The pet dropdown next to the chips lists the pets in care, a line, then the
 * pets of stays that are over. A photo added here is Only me or shared with the owner (Save); after the stay it can
 * only be for me. `?pet=` opens a given pet (a notice, a chat card).
 */
export function SitterFeed() {
  const { pet: petParam } = useLocalSearchParams<{ pet?: string }>();
  const { profile } = useSession();
  const sitterId = profile?.id;
  const [pets, setPets] = useState<FeedPet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sitterId) return;
    try {
      setPets(feedPetsFromBookings(await listSitterBookings(sitterId)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sitterId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // A link to a pet (`?pet=`) wins over what was picked before.
  useEffect(() => {
    if (petParam) setChosen(petParam);
  }, [petParam]);

  if (error && !pets) {
    return <EmptyState emoji="📸" title="Couldn't load pets" message={error} action={{ label: "Try again", onPress: () => void load() }} />;
  }
  if (!pets) return <LoadingView />;
  if (pets.length === 0) {
    return (
      <EmptyState
        emoji="📸"
        title="Share a moment"
        message="When you're caring for a pet, open them here to share photos with the owner."
      />
    );
  }

  const pet = pets.find((p) => p.id === chosen) ?? pets[0];
  const groups = [
    { key: "care", hint: "In care", pets: pets.filter((p) => p.caring) },
    { key: "past", hint: "Past stay", pets: pets.filter((p) => !p.caring) },
  ];
  return <SitterPetFeed key={pet.id} pet={pet} petPicker={<FeedPetPicker groups={groups} value={pet.id} onChange={setChosen} />} />;
}

function SitterPetFeed({ pet, petPicker }: { pet: FeedPet; petPicker: React.ReactNode }) {
  const petId = pet.id;
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const session = useSession();
  const currentUserId = session.status === "signedIn" ? session.profile.id : null;
  const { feedRevision } = useNotifications();

  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  /** While a photo is on its way: what is happening to it. */
  const [stage, setStage] = useState<"uploading" | "captioning" | null>(null);

  const loadPage = useCallback(
    async (offset: number, append: boolean, soft = false) => {
      if (!append && !soft) setFeed({ status: "loading" });
      try {
        const page = await listFeedPosts(petId, { offset, limit: FEED_PAGE_SIZE });
        setFeed((prev) => {
          const existing = append && prev.status !== "loading" ? prev.posts : [];
          const posts = append ? [...existing, ...page] : page;
          return { status: "ready", posts, hasMore: page.length === FEED_PAGE_SIZE };
        });
      } catch (error) {
        setFeed((prev) => ({
          status: "error",
          message: (error as Error).message,
          posts: (append || soft) && prev.status !== "loading" ? prev.posts : [],
          hasMore: false,
        }));
      }
    },
    [petId],
  );

  useEffect(() => {
    void loadPage(0, false);
  }, [loadPage]);

  // The owner shared a photo (5.9) or a post was deleted: refetch without a spinner.
  useEffect(() => {
    if (feedRevision === 0) return;
    void loadPage(0, false, true);
  }, [feedRevision, loadPage]);

  const loadMore = useCallback(async () => {
    if (feed.status !== "ready" || !feed.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(feed.posts.length, true);
    } finally {
      setLoadingMore(false);
    }
  }, [feed, loadingMore, loadPage]);

  const addPhoto = async () => {
    if (stage) return;
    const next = await pickMedia({ purpose: "feed", mediaTypes: ["image", "video"] });
    if (next) setPicked(next);
  };

  const savePhoto = async ({ share, note }: { share: boolean; note: string }) => {
    if (!picked || stage) return;
    setStage("uploading");
    try {
      const kind = picked.file.type.startsWith("video/") ? "video" : "image";
      const uploaded = await uploadMedia({
        petId,
        purpose: "feed",
        file: picked.file,
        trim: picked.trim,
        resourceType: kind,
      });
      // The sitter types no caption: while caring the model writes it and picks the tag; after the stay, or if it can't, the post still goes.
      let written = { caption: FALLBACK_CAPTION, category: null as Awaited<ReturnType<typeof captionPhoto>>["category"], source: "fallback" as "ai" | "fallback" };
      if (pet.caring) {
        setStage("captioning");
        written = await captionPhoto(petId, uploaded.mediaId);
      }
      await createFeedPost({
        petId,
        mediaId: uploaded.mediaId,
        caption: written.caption,
        captionSource: written.source,
        category: written.category,
        role: "sitter",
        visibility: share ? "shared" : "private",
        note,
      });
      setPicked(null);
      toast.show(share ? `Shared with ${pet.ownerName}` : "Saved just for you");
      await loadPage(0, false, true);
    } catch (err) {
      const message =
        err instanceof UploadError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't save this photo. Try again.";
      errorDialog.show({ title: "Photo not saved", message, onRetry: () => void savePhoto({ share, note }) });
    } finally {
      setStage(null);
    }
  };

  return (
    <View style={styles.safe} testID="sitter-pet-feed">
      <FeedBrowser
        posts={feed.status === "loading" ? [] : feed.posts}
        loading={feed.status === "loading"}
        hasMore={feed.status === "ready" ? feed.hasMore : false}
        loadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
        currentUserId={currentUserId}
        onRemoved={(id) => setFeed((prev) => (prev.status === "loading" ? prev : { ...prev, posts: prev.posts.filter((p) => p.id !== id) }))}
        onPostChange={(id, change) =>
          setFeed((prev) =>
            prev.status === "loading" ? prev : { ...prev, posts: prev.posts.map((p) => (p.id === id ? { ...p, ...change } : p)) },
          )
        }
        petPicker={petPicker}
        emptyMessage={pet.caring ? `Tap + to share ${pet.name}'s day.` : "Photos you save for yourself show up here."}
        error={feed.status === "error" && feed.posts.length === 0 ? { message: feed.message, onRetry: () => void loadPage(0, false) } : null}
        testID="sitter-feed-list"
      />

      <View style={styles.fabRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add photo"
          disabled={stage != null}
          onPress={() => void addPhoto()}
          style={({ pressed }) => [styles.fab, (pressed || stage != null) && styles.fabPressed]}
          testID="feed-add-photo"
        >
          <Text style={styles.fabLabel}>+ Photo</Text>
        </Pressable>
      </View>

      <AddPhotoSheet
        file={picked?.file ?? null}
        shareWith={pet.ownerName}
        canShare={pet.caring}
        defaultShare={pet.caring}
        saving={stage != null}
        statusText={stage === "captioning" ? "Writing a caption…" : "Uploading…"}
        onClose={() => setPicked(null)}
        onSave={(choice) => void savePhoto(choice)}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    fabRow: {
      position: "absolute",
      right: theme.spacing.md,
      bottom: theme.spacing.lg,
    },
    fab: {
      minHeight: 48,
      paddingHorizontal: theme.spacing.md,
      borderRadius: 24,
      backgroundColor: theme.color.primary,
      alignItems: "center",
      justifyContent: "center",
      ...Platform.select({
        web: { boxShadow: "0 4px 12px rgba(26, 26, 26, 0.2)" },
        default: {
          shadowColor: "#1A1A1A", // tokens-ok: the floating button's shadow, as before
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
      }),
    },
    fabPressed: {
      opacity: 0.85,
    },
    fabLabel: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.bold,
      color: theme.color.primaryText,
    },
  });
