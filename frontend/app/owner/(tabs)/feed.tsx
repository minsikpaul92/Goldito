import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddPhotoSheet } from "../../../components/AddPhotoSheet";
import { FeedBrowser } from "../../../components/FeedBrowser";
import { FeedPetPicker } from "../../../components/FeedPetPicker";
import { FeedSwitch } from "../../../components/FeedSwitch";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { useInCare } from "../../../features/care/useInCare";
import { OwnerDiaryBook } from "../../../features/diary/OwnerDiaryBook";
import { useMyPets } from "../../../features/pets/useMyPets";
import { UploadError, uploadMedia } from "../../../lib/cloudinary";
import {
  FALLBACK_CAPTION,
  FEED_PAGE_SIZE,
  FeedTimelinePost,
  createFeedPost,
  listFeedPosts,
} from "../../../lib/feed";
import { PickedMedia, pickMedia } from "../../../lib/media";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useNotifications } from "../../../providers/NotificationsProvider";
import { useSession } from "../../../providers/SessionProvider";
import { useErrorDialog } from "../../../providers/ErrorDialogProvider";
import { useToast } from "../../../providers/ToastProvider";
import { Theme } from "../../../theme/themes";

type FeedState =
  | { status: "loading" }
  | { status: "ready"; posts: FeedTimelinePost[]; hasMore: boolean }
  | { status: "error"; message: string; posts: FeedTimelinePost[]; hasMore: boolean };

/**
 * Owner Feed tab (#345, Figma 1730:104019): everything saved for the pet in a filterable mosaic; photos you take or add and
 * the ones your sitter sends are in it on their own, and so are your stickers. Add a photo: pick it, choose Only me or Share
 * with your sitter, an optional memo, Save.
 */
export default function OwnerFeedTab() {
  return <FeedSwitch photos={<OwnerFeed />} diary={<OwnerDiaryBook />} />;
}

function OwnerFeed() {
  const styles = useThemedStyles(makeStyles);
  const { feedRevision } = useNotifications();
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const session = useSession();
  const currentUserId = session.status === "signedIn" ? session.profile.id : null;
  const { status: petsStatus, pets, error: petsError, reload: reloadPets } = useMyPets();
  // A notice opens this screen on the pet it is about (`?pet=`).
  const { pet: petParam } = useLocalSearchParams<{ pet?: string }>();
  const [petId, setPetId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [saving, setSaving] = useState(false);
  const inCare = useInCare();

  useEffect(() => {
    if (pets.length === 0) {
      setPetId(null);
      return;
    }
    const wanted = petParam && pets.some((p) => p.id === petParam) ? petParam : null;
    setPetId((current) => wanted ?? (current && pets.some((p) => p.id === current) ? current : pets[0].id));
  }, [pets, petParam]);

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
    if (!petId) {
      if (petsStatus === "ready") setFeed({ status: "ready", posts: [], hasMore: false });
      return;
    }
    void loadPage(0, false);
  }, [petId, petsStatus, loadPage]);

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

  const caring = petId != null && inCare[petId] != null;

  const addPhoto = async () => {
    if (!petId || saving) return;
    const next = await pickMedia({ purpose: "feed", mediaTypes: ["image", "video"] });
    if (next) setPicked(next);
  };

  const savePhoto = async ({ share, note }: { share: boolean; note: string }) => {
    if (!petId || !picked || saving) return;
    setSaving(true);
    try {
      const kind = picked.file.type.startsWith("video/") ? "video" : "image";
      const uploaded = await uploadMedia({
        petId,
        purpose: "feed",
        file: picked.file,
        trim: picked.trim,
        resourceType: kind,
      });
      await createFeedPost({
        petId,
        mediaId: uploaded.mediaId,
        caption: FALLBACK_CAPTION,
        captionSource: "fallback",
        role: "owner",
        visibility: share ? "shared" : "private",
        note,
      });
      setPicked(null);
      toast.show(share ? "Shared with your sitter" : "Saved just for you");
      await loadPage(0, false, true);
    } catch (err) {
      errorDialog.show({
        title: "Photo not saved",
        message:
          err instanceof UploadError || err instanceof Error ? err.message : "Couldn't save this photo. Try again.",
        onRetry: () => void savePhoto({ share, note }),
      });
    } finally {
      setSaving(false);
    }
  };

  if (petsStatus === "loading" && pets.length === 0) return <LoadingView />;

  if (petsStatus === "error" && pets.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState
          emoji="📸"
          title="Couldn't load your pets"
          message={petsError ?? "Try again."}
          action={{ label: "Try again", onPress: () => void reloadPets() }}
        />
      </SafeAreaView>
    );
  }

  if (pets.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState emoji="🐾" title="No pets yet" message="Add a pet on Home first." />
      </SafeAreaView>
    );
  }

  const posts = feed.status === "loading" ? [] : feed.posts;
  const petGroups = [{ key: "mine", pets: pets.map((p) => ({ id: p.id, name: p.name, species: p.species })) }];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <FeedBrowser
        posts={posts}
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
        petPicker={<FeedPetPicker groups={petGroups} value={petId} onChange={setPetId} />}
        emptyMessage="Your sitter will share photos here."
        error={feed.status === "error" && posts.length === 0 ? { message: feed.message, onRetry: () => void loadPage(0, false) } : null}
        testID="owner-feed-list"
      />

      <View style={styles.fabRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add photo"
          disabled={saving}
          onPress={() => void addPhoto()}
          style={({ pressed }) => [styles.fab, (pressed || saving) && styles.fabPressed]}
          testID="feed-add-photo"
        >
          <Text style={styles.fabLabel}>+ Photo</Text>
        </Pressable>
      </View>

      <AddPhotoSheet
        file={picked?.file ?? null}
        shareWith={petId ? (inCare[petId]?.sitterName ?? "your sitter") : "your sitter"}
        canShare={caring}
        defaultShare={false}
        saving={saving}
        onClose={() => setPicked(null)}
        onSave={(choice) => void savePhoto(choice)}
      />
    </SafeAreaView>
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
