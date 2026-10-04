import { useCallback, useEffect, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FeedCard } from "../../../components/FeedCard";
import { FeedViewer } from "../../../components/FeedViewer";
import { ShareToggle } from "../../../components/ShareToggle";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { Sheet } from "../../../components/ui/Sheet";
import { TextButton } from "../../../components/ui/TextButton";
import { useMyPets } from "../../../features/pets/useMyPets";
import { UploadError, uploadMedia } from "../../../lib/cloudinary";
import {
  FALLBACK_CAPTION,
  FEED_PAGE_SIZE,
  FeedTimelinePost,
  createFeedPost,
  deleteFeedPost,
  listFeedPosts,
} from "../../../lib/feed";
import { pickMedia } from "../../../lib/media";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useNotifications } from "../../../providers/NotificationsProvider";
import { useSession } from "../../../providers/SessionProvider";
import { useToast } from "../../../providers/ToastProvider";
import { Theme } from "../../../theme/themes";

type FeedState =
  | { status: "loading" }
  | { status: "ready"; posts: FeedTimelinePost[]; hasMore: boolean }
  | { status: "error"; message: string; posts: FeedTimelinePost[]; hasMore: boolean };

/**
 * Owner Feed tab (phase-05): Instagram 3-col album.
 * ▶ = play in cell; tap photo = full-screen viewer (swipe / arrows).
 * Owner can add their own photos (private by default, optional "Visible to sitter") and
 * delete the posts they made (5.8).
 */
export default function OwnerFeed() {
  const styles = useThemedStyles(makeStyles);
  const { feedRevision } = useNotifications();
  const toast = useToast();
  const session = useSession();
  const currentUserId = session.status === "signedIn" ? session.profile.id : null;
  const { status: petsStatus, pets, error: petsError, reload: reloadPets } = useMyPets();
  const [petId, setPetId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewerPostId, setViewerPostId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Owner posts are private unless this chip is on (5.8).
  const [visibleToSitter, setVisibleToSitter] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (pets.length === 0) {
      setPetId(null);
      return;
    }
    setPetId((current) => (current && pets.some((p) => p.id === current) ? current : pets[0].id));
  }, [pets]);

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

  const sharePhoto = async () => {
    if (!petId || uploading) return;
    const picked = await pickMedia({ purpose: "feed", mediaTypes: ["image", "video"] });
    if (!picked) return;

    setUploading(true);
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
        visibility: visibleToSitter ? "shared" : "private",
      });
      toast.show(visibleToSitter ? "Shared with your sitter 🐾" : "Saved just for you 🔒");
      await loadPage(0, false, true);
    } catch (err) {
      toast.show(
        err instanceof UploadError || err instanceof Error
          ? err.message
          : "Couldn't share this photo. Try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId || deleting) return;
    const id = pendingDeleteId;
    setDeleting(true);
    try {
      await deleteFeedPost(id);
      setPendingDeleteId(null);
      setViewerPostId(null);
      setFeed((prev) =>
        prev.status === "loading" ? prev : { ...prev, posts: prev.posts.filter((p) => p.id !== id) },
      );
      toast.show("Photo deleted");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't delete this photo. Try again.");
    } finally {
      setDeleting(false);
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
        <EmptyState
          emoji="🐾"
          title="No pets yet"
          message="Add a pet on Home — then your sitter can share photos here."
        />
      </SafeAreaView>
    );
  }

  if (feed.status === "loading") return <LoadingView />;

  const posts = feed.status === "ready" || feed.status === "error" ? feed.posts : [];
  const hasMore = feed.status === "ready" ? feed.hasMore : false;
  const petOptions = pets.slice(0, 4).map((p) => ({ value: p.id, label: p.name }));

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={posts.length > 0 ? styles.row : undefined}
        contentContainerStyle={[styles.list, posts.length === 0 && styles.listEmpty]}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          petOptions.length > 1 ? (
            <View style={styles.petSwitch}>
              <SegmentedControl
                options={petOptions}
                value={petId}
                onChange={setPetId}
                testID="feed-pet"
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          feed.status === "error" ? (
            <EmptyState
              emoji="📸"
              title="Couldn't load the feed"
              message={feed.message}
              action={{ label: "Try again", onPress: () => void loadPage(0, false) }}
            />
          ) : (
            <EmptyState
              emoji="📸"
              title="No posts yet"
              message="Your sitter will share photos here."
            />
          )
        }
        ListFooterComponent={
          hasMore ? (
            <TextButton
              label={loadingMore ? "Loading…" : "Load more"}
              onPress={() => void loadMore()}
              disabled={loadingMore}
              testID="feed-load-more"
            />
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <FeedCard post={item} onOpen={() => setViewerPostId(item.id)} />
          </View>
        )}
        testID="owner-feed-list"
      />

      <View style={styles.fabRow}>
        <ShareToggle
          label="Visible to sitter"
          on={visibleToSitter}
          onToggle={() => setVisibleToSitter((v) => !v)}
          disabled={uploading}
          testID="feed-share-toggle"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add photo"
          disabled={uploading}
          onPress={() => void sharePhoto()}
          style={({ pressed }) => [styles.fab, (pressed || uploading) && styles.fabPressed]}
          testID="feed-add-photo"
        >
          <Text style={styles.fabLabel}>{uploading ? "…" : "+ Photo"}</Text>
        </Pressable>
      </View>

      <FeedViewer
        visible={viewerPostId != null && pendingDeleteId == null}
        posts={posts}
        initialPostId={viewerPostId}
        onClose={() => setViewerPostId(null)}
        onNearEnd={() => void loadMore()}
        currentUserId={currentUserId}
        onRequestDelete={(id) => {
          // Reopen on this post if the delete is cancelled (the viewer hides behind the sheet).
          setViewerPostId(id);
          setPendingDeleteId(id);
        }}
      />

      <Sheet
        visible={pendingDeleteId != null}
        title="Delete this photo?"
        onClose={() => {
          if (!deleting) setPendingDeleteId(null);
        }}
        testID="feed-delete-sheet"
        footer={
          <Button
            label={deleting ? "Deleting…" : "Delete photo"}
            disabled={deleting}
            onPress={() => void confirmDelete()}
            testID="feed-delete-confirm"
          />
        }
      >
        <Text style={styles.deleteBody}>This deletes the photo for good.</Text>
      </Sheet>
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    list: {
      flexGrow: 1,
      padding: theme.spacing.sm,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    listEmpty: {
      flexGrow: 1,
    },
    petSwitch: {
      marginBottom: theme.spacing.md,
      paddingHorizontal: theme.spacing.xs,
    },
    row: {
      gap: 2,
      marginBottom: 2,
    },
    cell: {
      flex: 1,
      maxWidth: "33.333%",
    },
    fabRow: {
      position: "absolute",
      right: theme.spacing.md,
      bottom: theme.spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
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
          shadowColor: "#1A1A1A",
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
      fontWeight: "700",
      color: theme.color.primaryText,
    },
    deleteBody: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
      lineHeight: theme.fontSize.body * 1.4,
    },
  });
