import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { FeedCard } from "../../../../components/FeedCard";
import { FeedViewer } from "../../../../components/FeedViewer";
import { Button } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { ShareToggle } from "../../../../components/ShareToggle";
import { Sheet } from "../../../../components/ui/Sheet";
import { TextButton } from "../../../../components/ui/TextButton";
import { UploadError, uploadMedia } from "../../../../lib/cloudinary";
import {
  FALLBACK_CAPTION,
  FEED_PAGE_SIZE,
  FeedTimelinePost,
  createFeedPost,
  deleteFeedPost,
  listFeedPosts,
} from "../../../../lib/feed";
import { pickMedia } from "../../../../lib/media";
import { getSupabase } from "../../../../lib/supabase";
import { useSession } from "../../../../providers/SessionProvider";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";

type PetInfo = { id: string; name: string; ownerName: string };

type FeedState =
  | { status: "loading" }
  | { status: "ready"; posts: FeedTimelinePost[]; hasMore: boolean }
  | { status: "error"; message: string; posts: FeedTimelinePost[]; hasMore: boolean };

/**
 * Sitter pet feed (phase-05): 3-col album + **+ Photo** FAB → pickMedia → uploadMedia → createFeedPost.
 * No caption field (D38). Toast: "Shared with {owner} 🐾". Author can Delete from viewer (5.7).
 */
export default function SitterPetFeed() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const session = useSession();
  const currentUserId = session.status === "signedIn" ? session.profile.id : null;

  const [pet, setPet] = useState<PetInfo | null>(null);
  const [petError, setPetError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewerPostId, setViewerPostId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // "Share with owner" — on by default; off keeps the post sitter-only (5.8).
  const [shareWithOwner, setShareWithOwner] = useState(true);

  const loadPet = useCallback(async () => {
    if (!petId) return;
    setPetError(null);
    const { data, error } = await getSupabase()
      .from("pets")
      .select("id, name, owner:profiles!pets_owner_id_fkey(display_name)")
      .eq("id", petId)
      .maybeSingle();
    if (error || !data) {
      setPet(null);
      setPetError(error?.message ?? "Pet not found");
      return;
    }
    const ownerRaw = data.owner as { display_name: string } | { display_name: string }[] | null;
    const owner = Array.isArray(ownerRaw) ? ownerRaw[0] : ownerRaw;
    setPet({
      id: data.id as string,
      name: data.name as string,
      ownerName: owner?.display_name ?? "the owner",
    });
  }, [petId]);

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
    if (!petId || !pet || uploading) return;
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
        role: "sitter",
        visibility: shareWithOwner ? "shared" : "private",
      });
      toast.show(shareWithOwner ? `Shared with ${pet.ownerName} 🐾` : "Saved just for you 🔒");
      await loadPage(0, false, true);
    } catch (err) {
      const message =
        err instanceof UploadError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't share this photo. Try again.";
      toast.show(message);
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
      setFeed((prev) => {
        if (prev.status === "loading") return prev;
        return { ...prev, posts: prev.posts.filter((p) => p.id !== id) };
      });
      toast.show("Photo deleted");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't delete this photo. Try again.");
    } finally {
      setDeleting(false);
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

  const posts = feed.status === "ready" || feed.status === "error" ? feed.posts : [];
  const hasMore = feed.status === "ready" ? feed.hasMore : false;

  return (
    <View style={styles.safe} testID="sitter-pet-feed">
      <Stack.Screen options={{ title: pet.name }} />

      {feed.status === "error" && posts.length === 0 ? (
        <EmptyState
          emoji="📸"
          title="Couldn't load posts"
          message={feed.message}
          action={{ label: "Try again", onPress: () => void loadPage(0, false) }}
        />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={posts.length > 0 ? styles.row : undefined}
          contentContainerStyle={[styles.list, posts.length === 0 && !uploading && styles.listEmpty]}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            uploading ? (
              <View style={styles.skeleton} testID="feed-uploading">
                <View style={styles.skeletonMedia} />
                <Text style={styles.skeletonText}>Uploading…</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            uploading ? null : (
              <EmptyState
                emoji="📸"
                title="No posts yet"
                message={`No posts yet — tap + to share ${pet.name}'s day.`}
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
        />
      )}

      <View style={styles.fabRow}>
        <ShareToggle
          label={`Share with ${pet.ownerName}`}
          on={shareWithOwner}
          onToggle={() => setShareWithOwner((v) => !v)}
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
        <Text style={styles.deleteBody}>
          {`This deletes the photo for good. ${pet.ownerName} won't see it anymore.`}
        </Text>
      </Sheet>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    list: {
      padding: theme.spacing.sm,
      paddingBottom: theme.spacing.xl * 3,
    },
    listEmpty: {
      flexGrow: 1,
    },
    row: {
      gap: 2,
      marginBottom: 2,
    },
    cell: {
      flex: 1,
      maxWidth: "33.333%",
    },
    skeleton: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      overflow: "hidden",
      marginBottom: theme.spacing.md,
      alignSelf: "flex-start",
      width: "33%",
    },
    skeletonMedia: {
      width: "100%",
      aspectRatio: 1,
      backgroundColor: theme.color.border,
    },
    skeletonText: {
      padding: theme.spacing.sm,
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
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
