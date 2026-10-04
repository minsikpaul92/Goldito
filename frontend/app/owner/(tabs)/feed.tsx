import { createElement, useCallback, useEffect, useState } from "react";
import { FlatList, Image, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FeedCard } from "../../../components/FeedCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { Sheet } from "../../../components/ui/Sheet";
import { TextButton } from "../../../components/ui/TextButton";
import { useMyPets } from "../../../features/pets/useMyPets";
import { thumbUrl, videoPosterUrl, videoUrl } from "../../../lib/cloudinary";
import {
  FEED_PAGE_SIZE,
  FeedTimelinePost,
  formatFeedTime,
  listFeedPosts,
} from "../../../lib/feed";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

type FeedState =
  | { status: "loading" }
  | { status: "ready"; posts: FeedTimelinePost[]; hasMore: boolean }
  | { status: "error"; message: string; posts: FeedTimelinePost[]; hasMore: boolean };

/**
 * Owner Feed tab (phase-05 5.2): newest posts for the selected pet, Cloudinary thumbs,
 * Load more / onEndReached. Detail sheet plays video on web (demo target).
 */
export default function OwnerFeed() {
  const styles = useThemedStyles(makeStyles);
  const { status: petsStatus, pets, error: petsError, reload: reloadPets } = useMyPets();
  const [petId, setPetId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<FeedTimelinePost | null>(null);

  useEffect(() => {
    if (pets.length === 0) {
      setPetId(null);
      return;
    }
    setPetId((current) => (current && pets.some((p) => p.id === current) ? current : pets[0].id));
  }, [pets]);

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!petId) return;
      if (!append) setFeed({ status: "loading" });
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
          posts: append && prev.status !== "loading" ? prev.posts : [],
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

  const loadMore = useCallback(async () => {
    if (feed.status !== "ready" || !feed.hasMore || loadingMore || !petId) return;
    setLoadingMore(true);
    try {
      await loadPage(feed.posts.length, true);
    } finally {
      setLoadingMore(false);
    }
  }, [feed, loadingMore, petId, loadPage]);

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
        renderItem={({ item }) => <FeedCard post={item} onPress={() => setSelected(item)} />}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        testID="owner-feed-list"
      />

      <Sheet
        visible={selected != null}
        title={selected?.sitterName ?? "Photo"}
        onClose={() => setSelected(null)}
        testID="feed-detail"
      >
        {selected ? <FeedDetail post={selected} /> : null}
      </Sheet>
    </SafeAreaView>
  );
}

function FeedDetail({ post }: { post: FeedTimelinePost }) {
  const styles = useThemedStyles(makeStyles);
  const isVideo = post.media.resourceType === "video";
  const imageUri = isVideo
    ? videoPosterUrl(post.media.publicId, 800)
    : thumbUrl(post.media.publicId, 800);

  return (
    <View style={styles.detail} testID="feed-detail-body">
      {isVideo && Platform.OS === "web" ? (
        createElement("video", {
          src: videoUrl(post.media.publicId),
          controls: true,
          playsInline: true,
          style: {
            width: "100%",
            maxHeight: 360,
            borderRadius: 12,
            backgroundColor: "#000",
          },
          "data-testid": "feed-detail-video",
        })
      ) : imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.detailImage} accessibilityIgnoresInvertColors />
      ) : null}
      {post.caption ? <Text style={styles.detailCaption}>{post.caption}</Text> : null}
      <Text style={styles.detailMeta}>
        {post.sitterName} · {formatFeedTime(post.createdAt)}
      </Text>
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
      flexGrow: 1,
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    listEmpty: {
      flexGrow: 1,
    },
    petSwitch: {
      marginBottom: theme.spacing.md,
    },
    gap: {
      height: theme.spacing.md,
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
    detailCaption: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    detailMeta: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
  });
