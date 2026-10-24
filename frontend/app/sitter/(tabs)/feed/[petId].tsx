import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { AddPhotoSheet } from "../../../../components/AddPhotoSheet";
import { FeedBrowser } from "../../../../components/FeedBrowser";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { FeedPet, feedPetsFromBookings } from "../../../../features/feed/caringPets";
import { UploadError, uploadMedia } from "../../../../lib/cloudinary";
import { listSitterBookings } from "../../../../lib/bookings";
import {
  FALLBACK_CAPTION,
  FEED_PAGE_SIZE,
  FeedTimelinePost,
  captionPhoto,
  createFeedPost,
  listFeedPosts,
} from "../../../../lib/feed";
import { PickedMedia, pickMedia } from "../../../../lib/media";
import { useNotifications } from "../../../../providers/NotificationsProvider";
import { useSession } from "../../../../providers/SessionProvider";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useErrorDialog } from "../../../../providers/ErrorDialogProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";

type FeedState =
  | { status: "loading" }
  | { status: "ready"; posts: FeedTimelinePost[]; hasMore: boolean }
  | { status: "error"; message: string; posts: FeedTimelinePost[]; hasMore: boolean };

/**
 * Sitter pet feed (#345): the same filterable mosaic as the owner's, for a pet in care and for one from a stay that is
 * over. Photos taken while caring go to the owner on their own; a photo added here is Only me or shared with the owner
 * (Save), and after the stay it can only be for me. The feed stays after the stay.
 */
export default function SitterPetFeed() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const session = useSession();
  const currentUserId = session.status === "signedIn" ? session.profile.id : null;
  const { feedRevision } = useNotifications();

  const [pet, setPet] = useState<FeedPet | null>(null);
  const [petError, setPetError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  /** While a photo is on its way: what is happening to it. */
  const [stage, setStage] = useState<"uploading" | "captioning" | null>(null);

  // The pet comes from the stays, not the pets table: after the stay the sitter can no longer read the pet's profile.
  const loadPet = useCallback(async () => {
    if (!petId || !currentUserId) return;
    setPetError(null);
    try {
      const found = feedPetsFromBookings(await listSitterBookings(currentUserId)).find((p) => p.id === petId);
      setPet(found ?? null);
      if (!found) setPetError("Pet not found");
    } catch (error) {
      setPet(null);
      setPetError((error as Error).message);
    }
  }, [petId, currentUserId]);

  const loadPage = useCallback(
    async (offset: number, append: boolean, soft = false) => {
      if (!petId) return;
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
    void loadPet();
  }, [loadPet]);

  useEffect(() => {
    if (!petId) return;
    void loadPage(0, false);
  }, [petId, loadPage]);

  // The owner shared a photo (5.9) or a post was deleted: refetch without a spinner.
  useEffect(() => {
    if (!petId || feedRevision === 0) return;
    void loadPage(0, false, true);
  }, [feedRevision, petId, loadPage]);

  const loadMore = useCallback(async () => {
    if (feed.status !== "ready" || !feed.hasMore || loadingMore || !petId) return;
    setLoadingMore(true);
    try {
      await loadPage(feed.posts.length, true);
    } finally {
      setLoadingMore(false);
    }
  }, [feed, loadingMore, petId, loadPage]);

  const addPhoto = async () => {
    if (!pet || stage) return;
    const next = await pickMedia({ purpose: "feed", mediaTypes: ["image", "video"] });
    if (next) setPicked(next);
  };

  const savePhoto = async ({ share, note }: { share: boolean; note: string }) => {
    if (!petId || !pet || !picked || stage) return;
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

  if (!petId) {
    return (
      <View style={styles.safe}>
        <EmptyState emoji="🐾" title="Pet not found" message="Pick a pet from Feed." />
      </View>
    );
  }

  if (petError && !pet) {
    return (
      <View style={styles.safe}>
        <EmptyState
          emoji="🐾"
          title="Couldn't open this pet"
          message={petError}
          action={{ label: "Try again", onPress: () => void loadPet() }}
        />
      </View>
    );
  }

  if (!pet || feed.status === "loading") {
    return (
      <>
        <Stack.Screen options={{ title: pet?.name ?? "Pet" }} />
        <LoadingView />
      </>
    );
  }

  return (
    <View style={styles.safe} testID="sitter-pet-feed">
      <Stack.Screen options={{ title: pet.name }} />

      <FeedBrowser
        posts={feed.posts}
        hasMore={feed.status === "ready" ? feed.hasMore : false}
        loadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
        currentUserId={currentUserId}
        onRemoved={(id) => setFeed((prev) => (prev.status === "loading" ? prev : { ...prev, posts: prev.posts.filter((p) => p.id !== id) }))}
        onHiddenChange={(id, hidden) =>
          setFeed((prev) =>
            prev.status === "loading" ? prev : { ...prev, posts: prev.posts.map((p) => (p.id === id ? { ...p, hidden } : p)) },
          )
        }
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
