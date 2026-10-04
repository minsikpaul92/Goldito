import { Stack, useLocalSearchParams } from "expo-router";
import { createElement, useCallback, useEffect, useState } from "react";
import { FlatList, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { FeedCard } from "../../../components/FeedCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Sheet } from "../../../components/ui/Sheet";
import { TextButton } from "../../../components/ui/TextButton";
import { UploadError, thumbUrl, uploadMedia, videoPosterUrl, videoUrl } from "../../../lib/cloudinary";
import {
  FALLBACK_CAPTION,
  FEED_PAGE_SIZE,
  FeedTimelinePost,
  createFeedPost,
  formatFeedTime,
  listFeedPosts,
} from "../../../lib/feed";
import { pickMedia } from "../../../lib/media";
import { getSupabase } from "../../../lib/supabase";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useToast } from "../../../providers/ToastProvider";
import { Theme } from "../../../theme/themes";

type PetInfo = { id: string; name: string; ownerName: string };

type FeedState =
  | { status: "loading" }
  | { status: "ready"; posts: FeedTimelinePost[]; hasMore: boolean }
  | { status: "error"; message: string; posts: FeedTimelinePost[]; hasMore: boolean };

/**
 * Sitter pet feed (phase-05): timeline + **+ Photo** FAB → pickMedia → uploadMedia → createFeedPost.
 * No caption field (D38). Toast: "Shared with {owner} 🐾".
 */
export default function SitterPetFeed() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();

  const [pet, setPet] = useState<PetInfo | null>(null);
  const [petError, setPetError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<FeedTimelinePost | null>(null);

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
      });
      toast.show(`Shared with ${pet.ownerName} 🐾`);
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
          renderItem={({ item }) => <FeedCard post={item} onPress={() => setSelected(item)} />}
        />
      )}

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

      <Sheet visible={selected != null} title={selected?.caption ?? "Photo"} onClose={() => setSelected(null)}>
        {selected ? (
          <View style={styles.detail}>
            {selected.media.resourceType === "video" && Platform.OS === "web" ? (
              createElement("video", {
                src: videoUrl(selected.media.publicId),
                controls: true,
                playsInline: true,
                style: {
                  width: "100%",
                  aspectRatio: "4 / 3",
                  backgroundColor: "#000",
                  borderRadius: 12,
                },
              })
            ) : (
              <Image
                source={{
                  uri:
                    selected.media.resourceType === "video"
                      ? videoPosterUrl(selected.media.publicId, 800)
                      : thumbUrl(selected.media.publicId, 800),
                }}
                style={styles.detailImage}
                accessibilityIgnoresInvertColors
              />
            )}
            <Text style={styles.detailMeta}>
              {selected.sitterName} · {formatFeedTime(selected.createdAt)}
            </Text>
          </View>
        ) : null}
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
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.xl * 3,
      gap: theme.spacing.md,
    },
    listEmpty: {
      flexGrow: 1,
    },
    skeleton: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      overflow: "hidden",
      marginBottom: theme.spacing.md,
    },
    skeletonMedia: {
      width: "100%",
      aspectRatio: 4 / 3,
      backgroundColor: theme.color.border,
    },
    skeletonText: {
      padding: theme.spacing.md,
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    fab: {
      position: "absolute",
      right: theme.spacing.md,
      bottom: theme.spacing.lg,
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
    detail: {
      gap: theme.spacing.sm,
    },
    detailImage: {
      width: "100%",
      aspectRatio: 4 / 3,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.border,
    },
    detailMeta: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
  });
