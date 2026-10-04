import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FeedCard } from "../../../components/FeedCard";
import { FeedViewer } from "../../../components/FeedViewer";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { TextButton } from "../../../components/ui/TextButton";
import { useMyPets } from "../../../features/pets/useMyPets";
import {
  FEED_PAGE_SIZE,
  FeedTimelinePost,
  listFeedPosts,
} from "../../../lib/feed";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useNotifications } from "../../../providers/NotificationsProvider";
import { Theme } from "../../../theme/themes";

type FeedState =
  | { status: "loading" }
  | { status: "ready"; posts: FeedTimelinePost[]; hasMore: boolean }
  | { status: "error"; message: string; posts: FeedTimelinePost[]; hasMore: boolean };

/**
 * Owner Feed tab (phase-05): Instagram 3-col album.
 * ▶ = play in cell; tap photo = full-screen viewer with vertical swipe.
 */
export default function OwnerFeed() {
  const styles = useThemedStyles(makeStyles);
  const { feedRevision } = useNotifications();
  const { status: petsStatus, pets, error: petsError, reload: reloadPets } = useMyPets();
  const [petId, setPetId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewerPostId, setViewerPostId] = useState<string | null>(null);

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

      <FeedViewer
        visible={viewerPostId != null}
        posts={posts}
        initialPostId={viewerPostId}
        onClose={() => setViewerPostId(null)}
        onNearEnd={() => void loadMore()}
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
  });
