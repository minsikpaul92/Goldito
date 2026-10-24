import { ReactNode, useMemo, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { FeedDeleteSheet } from "./FeedDeleteSheet";
import { FeedFilterChips } from "./FeedFilterChips";
import { FeedTagIcon } from "./FeedTagIcon";
import { FeedViewer } from "./FeedViewer";
import { HOME_TEXT } from "./home/homeType";
import { EmptyState } from "./ui/EmptyState";
import { sectionTitleStyle } from "./ui/SectionTitle";
import { TextButton } from "./ui/TextButton";
import { appToday, isoToZoned } from "../features/schedule/dates";
import { deliveryUrl, thumbUrl, videoPosterUrl } from "../lib/cloudinary";
import {
  DeleteScope,
  FEED_FILTERS,
  FeedFilterKey,
  FeedTimelinePost,
  MosaicRow,
  buildMosaic,
  feedBadgeTime,
  feedTag,
  hideFeedPost,
  matchesFilter,
  removeFeedPost,
  unhideFeedPost,
} from "../lib/feed";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import { tokens } from "../theme/tokens";

/** Space between photos, and the side margin: Figma 1730:104083 (8 px between photos, 20 px at the sides). */
const GAP = 8;
const SIDE = 20;
/** The tag and time badge on a photo (Figma 11.5 / 20). */
const BADGE_TEXT = 11.5; // tokens-ok: Figma photo badge time
const CELL_RADIUS = 22;

type Props = {
  /** Everything loaded so far for the pet (hidden ones included; this screen sorts them out). */
  posts: FeedTimelinePost[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  currentUserId: string | null;
  /** A photo was deleted: drop it from the list. */
  onRemoved: (postId: string) => void;
  /** A photo was hidden or brought back. */
  onHiddenChange: (postId: string, hidden: boolean) => void;
  /** Above the chips (the pet switch). */
  header?: ReactNode;
  /** What the empty Feed says it will show. */
  emptyMessage: string;
  /** The list could not load: this message with a Try again. */
  error?: { message: string; onRetry: () => void } | null;
  testID?: string;
};

const EMPTY_TITLE: Record<FeedFilterKey, string> = {
  all: "No photos yet",
  meal: "No meals yet",
  walk: "No walks yet",
  nap: "No naps yet",
  mood: "No mood photos yet",
  potty: "No potty photos yet",
  none: "No untagged photos",
};

/**
 * The Feed of one pet for both roles (#345, Figma 1730:104019): filter chips, a header per day, the newest photo as a
 * 2 x 2 tile with two small ones beside it, then three photos to a row. A photo opens full screen with its tag, date,
 * time and memo; Hide and Delete live there. Hidden photos wait behind "Hidden".
 */
export function FeedBrowser({
  posts,
  hasMore,
  loadingMore,
  onLoadMore,
  currentUserId,
  onRemoved,
  onHiddenChange,
  header,
  emptyMessage,
  error,
  testID,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [width, setWidth] = useState(0);
  const [filter, setFilter] = useState<FeedFilterKey>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const shown = useMemo(
    () => posts.filter((p) => p.hidden === showHidden && matchesFilter(p, filter)),
    [posts, showHidden, filter],
  );
  const rows = useMemo(() => buildMosaic(shown, (iso) => isoToZoned(iso).day, appToday()), [shown]);
  const hiddenCount = posts.filter((p) => p.hidden).length;
  const pending = posts.find((p) => p.id === pendingId) ?? null;

  const cell = width > 0 ? (width - 2 * SIDE - 2 * GAP) / 3 : 0;

  const hide = async (id: string, hidden: boolean) => {
    try {
      await (hidden ? hideFeedPost(id) : unhideFeedPost(id));
      onHiddenChange(id, hidden);
      setViewerId(null);
      toast.show(hidden ? "Photo hidden" : "Photo is back in your Feed");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't do that. Try again.");
    }
  };

  const confirmDelete = async (scope: DeleteScope) => {
    if (!pendingId || deleting) return;
    const id = pendingId;
    setDeleting(true);
    try {
      await removeFeedPost(id, scope);
      setPendingId(null);
      setViewerId(null);
      onRemoved(id);
      toast.show(scope === "everyone" ? "Photo deleted for both" : "Photo deleted");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't delete this photo. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  const empty = error ? (
    <EmptyState emoji="📸" title="Couldn't load the feed" message={error.message} action={{ label: "Try again", onPress: error.onRetry }} />
  ) : showHidden ? (
    <EmptyState emoji="📸" title="Nothing hidden" message="Photos you hide wait here." />
  ) : posts.length === 0 ? (
    <EmptyState emoji="📸" title="No photos yet" message={emptyMessage} />
  ) : (
    <EmptyState emoji="📸" title={EMPTY_TITLE[filter]} message="Photos with this tag show up here." />
  );

  return (
    <View style={styles.root} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <FlatList
        data={width > 0 ? rows : []}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.list}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.top}>
            {header}
            {showHidden ? (
              <View style={styles.hiddenBar}>
                <Text accessibilityRole="header" style={styles.hiddenTitle}>
                  Hidden
                </Text>
                <TextButton label="Back" onPress={() => setShowHidden(false)} testID="feed-hidden-back" />
              </View>
            ) : (
              <FeedFilterChips value={filter} onChange={setFilter} />
            )}
          </View>
        }
        ListEmptyComponent={width > 0 ? empty : null}
        ListFooterComponent={
          <View>
            {hasMore ? (
              <TextButton
                label={loadingMore ? "Loading…" : "Load more"}
                onPress={onLoadMore}
                disabled={loadingMore}
                testID="feed-load-more"
              />
            ) : null}
            {!showHidden && hiddenCount > 0 ? (
              <TextButton label={`Hidden (${hiddenCount})`} onPress={() => setShowHidden(true)} testID="feed-hidden-open" />
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <MosaicRowView row={item} first={index === 0} cell={cell} onOpen={setViewerId} />
        )}
        testID={testID ?? "feed-list"}
      />

      <FeedViewer
        visible={viewerId != null && pendingId == null}
        posts={shown}
        initialPostId={viewerId}
        onClose={() => setViewerId(null)}
        onNearEnd={onLoadMore}
        onHide={(id) => void hide(id, true)}
        onUnhide={(id) => void hide(id, false)}
        onRequestDelete={(id) => {
          // Reopen on this photo if the delete is cancelled (the viewer hides behind the sheet).
          setViewerId(id);
          setPendingId(id);
        }}
      />

      <FeedDeleteSheet
        post={pending}
        currentUserId={currentUserId}
        deleting={deleting}
        onClose={() => setPendingId(null)}
        onConfirm={(scope) => void confirmDelete(scope)}
      />
    </View>
  );
}

function MosaicRowView({
  row,
  first,
  cell,
  onOpen,
}: {
  row: MosaicRow;
  first: boolean;
  cell: number;
  onOpen: (postId: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  if (row.kind === "header") {
    return (
      <View style={[styles.dayHeader, !first && styles.dayHeaderLater]} testID={`feed-day-${row.key}`}>
        <Text accessibilityRole="header" style={styles.dayTitle}>
          {row.label}
        </Text>
        <Text style={styles.count}>{`${row.count} ${row.count === 1 ? "photo" : "photos"}`}</Text>
      </View>
    );
  }
  if (row.kind === "hero") {
    const big = 2 * cell + GAP;
    return (
      <View style={[styles.row, { height: big }]} testID="feed-hero-row">
        <FeedCell post={row.hero} w={big} h={big} onOpen={onOpen} />
        <View style={styles.side}>
          {row.side.map((post) => (
            <FeedCell key={post.id} post={post} w={cell} h={cell} onOpen={onOpen} />
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      {row.posts.map((post) => (
        <FeedCell key={post.id} post={post} w={cell} h={cell} onOpen={onOpen} />
      ))}
    </View>
  );
}

function FeedCell({ post, w, h, onOpen }: { post: FeedTimelinePost; w: number; h: number; onOpen: (postId: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const isVideo = post.media.resourceType === "video";
  const isSticker = post.media.purpose === "sticker";
  const tag = feedTag(post);
  const tagLabel = tag ? FEED_FILTERS.find((f) => f.key === tag)?.label : null;
  const time = feedBadgeTime(post.createdAt);
  const uri = isVideo
    ? videoPosterUrl(post.media.publicId, 600)
    : isSticker
      ? deliveryUrl(post.media.publicId, 400)
      : thumbUrl(post.media.publicId, 600);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tagLabel ?? "Photo"} at ${time}`}
      onPress={() => onOpen(post.id)}
      style={[styles.cell, { width: w, height: h }, isSticker && styles.stickerGround, post.hidden && styles.dim]}
      testID={`feed-card-${post.id}`}
    >
      <Image
        source={{ uri }}
        style={isSticker ? styles.stickerImage : StyleSheet.absoluteFill}
        resizeMode={isSticker ? "contain" : "cover"}
        accessibilityIgnoresInvertColors
      />
      {isVideo ? (
        <View style={styles.play} pointerEvents="none">
          <Text style={styles.playIcon}>▶</Text>
        </View>
      ) : null}
      <View style={styles.badge} pointerEvents="none">
        {tag ? <FeedTagIcon tag={tag} size={20} color={theme.color.text} /> : null}
        <Text style={styles.badgeText}>{time}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    list: {
      flexGrow: 1,
      paddingHorizontal: SIDE,
      paddingBottom: 96,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    top: { gap: 14, paddingTop: 8, paddingBottom: 14 },
    hiddenBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    hiddenTitle: sectionTitleStyle(theme),
    dayHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    dayHeaderLater: { marginTop: 10 },
    dayTitle: sectionTitleStyle(theme),
    count: { fontSize: HOME_TEXT.body, lineHeight: 17.5, fontWeight: theme.fontWeight.bold, color: theme.color.textMuted },
    row: { flexDirection: "row", gap: GAP, marginBottom: GAP },
    side: { gap: GAP },
    cell: { borderRadius: CELL_RADIUS, overflow: "hidden", backgroundColor: theme.color.border },
    stickerGround: { backgroundColor: tokens.color.blockButter },
    stickerImage: { flex: 1, margin: 12 },
    dim: { opacity: 0.6 },
    badge: {
      position: "absolute",
      left: 10,
      bottom: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingLeft: 4,
      paddingRight: 9,
      paddingVertical: 3,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
    },
    badgeText: { fontSize: BADGE_TEXT, lineHeight: 16.1, fontWeight: "800", color: theme.color.text },
    play: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    playIcon: { color: theme.color.onMedia, fontSize: HOME_TEXT.small, marginLeft: 2 },
  });
