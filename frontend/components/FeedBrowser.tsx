import { ReactNode, useEffect, useMemo, useState } from "react";
import { FlatList, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { FeedDeleteSheet } from "./FeedDeleteSheet";
import { FeedEditSheet } from "./FeedEditSheet";
import { FeedChipKey, FeedFilterChips } from "./FeedFilterChips";
import { FeedTagIcon } from "./FeedTagIcon";
import { PetFace, PetFaceInfo } from "./PetFace";
import { FeedViewer } from "./FeedViewer";
import { HOME_TEXT } from "./home/homeType";
import { EmptyState } from "./ui/EmptyState";
import { LoadingView } from "./ui/LoadingView";
import { sectionTitleStyle } from "./ui/SectionTitle";
import { TextButton } from "./ui/TextButton";
import { appToday, isoToZoned } from "../features/schedule/dates";
import { NO_PET_FOUND, stickerFromPhoto } from "../features/snap/photoSticker";
import { useSession } from "../providers/SessionProvider";
import { deliveryUrl, thumbUrl, videoPosterUrl } from "../lib/cloudinary";
import {
  DeleteScope,
  FEED_FILTERS,
  FeedFilterKey,
  FeedTimelinePost,
  MosaicRow,
  buildMosaic,
  feedBadgeTime,
  feedTags,
  hideFeedPost,
  matchesFilter,
  removeFeedPost,
  unhideFeedPost,
  updateFeedPost,
  FeedEdit,
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
  /** The first page is on its way: the pet dropdown and the chips are already there, the list says so. */
  loading?: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  currentUserId: string | null;
  /** A photo was deleted: drop it from the list. */
  onRemoved: (postId: string) => void;
  /** A photo changed: hidden or brought back, or edited by its author. */
  onPostChange: (postId: string, change: Partial<FeedTimelinePost>) => void;
  /** Fetch the feed again (a sticker was added). */
  onRefresh?: () => void;
  /** The pet dropdown, left of the chips. */
  /** Pets by id, when the Feed shows several together: each photo then carries its pet's face. */
  faces?: Record<string, PetFaceInfo>;
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
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  currentUserId,
  onRemoved,
  onPostChange,
  onRefresh,
  faces,
  emptyMessage,
  error,
  testID,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const { profile } = useSession();
  const [width, setWidth] = useState(0);
  const [filter, setFilter] = useState<FeedChipKey>("all");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const showHidden = filter === "hidden";
  const shown = useMemo(
    () => (filter === "hidden" ? posts.filter((p) => p.hidden) : posts.filter((p) => !p.hidden && matchesFilter(p, filter))),
    [posts, filter],
  );
  const rows = useMemo(() => buildMosaic(shown, (iso) => isoToZoned(iso).day, appToday()), [shown]);
  const hiddenCount = posts.filter((p) => p.hidden).length;
  // The last hidden photo came back: the Hidden chip is gone, so go back to All.
  useEffect(() => {
    if (filter === "hidden" && hiddenCount === 0) setFilter("all");
  }, [filter, hiddenCount]);
  const pending = posts.find((p) => p.id === pendingId) ?? null;
  const editing = posts.find((p) => p.id === editId) ?? null;

  const cell = width > 0 ? (width - 2 * SIDE - 2 * GAP) / 3 : 0;

  // A photo (not a clip or a sticker) can become a sticker right here: a spinner over the photo while it is cut out.
  const [making, setMaking] = useState(false);
  const canSticker = (post: FeedTimelinePost) =>
    Platform.OS === "web" && post.media.resourceType === "image" && post.media.purpose !== "sticker";
  const petNames = faces ? Object.fromEntries(Object.entries(faces).flatMap(([id, f]) => (f.name ? [[id, f.name]] : []))) : undefined;
  const makeSticker = async (id: string) => {
    const post = posts.find((p) => p.id === id);
    if (!post || !profile || making || !canSticker(post)) return;
    setMaking(true);
    try {
      await stickerFromPhoto({ publicId: post.media.publicId, petId: post.petId, me: profile.id });
      setViewerId(null);
      const name = petNames?.[post.petId];
      toast.show(name ? `Paw-fect! Saved to ${name}'s stickers` : "Paw-fect! Sticker saved");
      onRefresh?.();
    } catch (err) {
      setViewerId(null);
      const message = err instanceof Error ? err.message : "";
      toast.show(message === NO_PET_FOUND ? message : "Couldn't make a sticker. Try again.");
    } finally {
      setMaking(false);
    }
  };

  const hide = async (id: string, hidden: boolean) => {
    try {
      await (hidden ? hideFeedPost(id) : unhideFeedPost(id));
      onPostChange(id, { hidden });
      setViewerId(null);
      toast.show(hidden ? "Photo hidden" : "Photo is back in your Feed");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't do that. Try again.");
    }
  };

  const saveEdit = async (edit: FeedEdit) => {
    if (!editId || saving) return;
    const id = editId;
    setSaving(true);
    try {
      await updateFeedPost(id, edit);
      onPostChange(id, {
        takenAt: edit.takenAt,
        note: edit.note || null,
        tags: edit.tags,
        category: edit.tags[0] ?? null,
      });
      setEditId(null);
      toast.show("Photo updated");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't save this photo. Try again.");
    } finally {
      setSaving(false);
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

  const empty = loading ? (
    <LoadingView />
  ) : error ? (
    <EmptyState emoji="📸" title="Couldn't load the feed" message={error.message} action={{ label: "Try again", onPress: error.onRetry }} />
  ) : showHidden ? (
    <EmptyState emoji="📸" title="Nothing hidden" message="Photos you hide wait here." />
  ) : posts.length === 0 ? (
    <EmptyState emoji="📸" title="No photos yet" message={emptyMessage} />
  ) : (
    <EmptyState emoji="📸" title={EMPTY_TITLE[filter as FeedFilterKey]} message="Photos with this tag show up here." />
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
            <View style={styles.filters}>
              <View style={styles.chips}>
                <FeedFilterChips value={filter} onChange={setFilter} hiddenCount={hiddenCount} />
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={width > 0 ? empty : null}
        ListFooterComponent={
          hasMore ? (
            <TextButton
              label={loadingMore ? "Loading…" : "Load more"}
              onPress={onLoadMore}
              disabled={loadingMore}
              testID="feed-load-more"
            />
          ) : null
        }
        renderItem={({ item, index }) => (
          <MosaicRowView row={item} first={index === 0} cell={cell} onOpen={setViewerId} faces={faces} />
        )}
        testID={testID ?? "feed-list"}
      />

      <FeedViewer
        visible={viewerId != null && pendingId == null && editId == null}
        posts={shown}
        petNames={petNames}
        initialPostId={viewerId}
        onClose={() => setViewerId(null)}
        onNearEnd={onLoadMore}
        canEdit={(post) => currentUserId != null && post.postedBy === currentUserId && post.media.purpose !== "sticker"}
        onRequestEdit={(id) => {
          // Reopen on this photo when the edit is closed (the viewer hides behind the sheet).
          setViewerId(id);
          setEditId(id);
        }}
        canSticker={canSticker}
        onMakeSticker={(id) => void makeSticker(id)}
        busy={making}
        onHide={(id) => void hide(id, true)}
        onUnhide={(id) => void hide(id, false)}
        onRequestDelete={(id) => {
          // Reopen on this photo if the delete is cancelled (the viewer hides behind the sheet).
          setViewerId(id);
          setPendingId(id);
        }}
      />

      <FeedEditSheet post={editing} saving={saving} onClose={() => setEditId(null)} onSave={(edit) => void saveEdit(edit)} />

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
  faces,
}: {
  row: MosaicRow;
  first: boolean;
  cell: number;
  onOpen: (postId: string) => void;
  faces?: Record<string, PetFaceInfo>;
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
        <FeedCell post={row.hero} w={big} h={big} onOpen={onOpen} faces={faces} />
        <View style={styles.side}>
          {row.side.map((post) => (
            <FeedCell key={post.id} post={post} w={cell} h={cell} onOpen={onOpen} faces={faces} />
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      {row.posts.map((post) => (
        <FeedCell key={post.id} post={post} w={cell} h={cell} onOpen={onOpen} faces={faces} />
      ))}
    </View>
  );
}

function FeedCell({
  post,
  w,
  h,
  onOpen,
  faces,
}: {
  post: FeedTimelinePost;
  w: number;
  h: number;
  onOpen: (postId: string) => void;
  faces?: Record<string, PetFaceInfo>;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const isVideo = post.media.resourceType === "video";
  const isSticker = post.media.purpose === "sticker";
  const tags = feedTags(post);
  const tagLabel = tags.length > 0 ? tags.map((t) => FEED_FILTERS.find((f) => f.key === t)?.label).join(", ") : null;
  const time = feedBadgeTime(post.takenAt);
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
      {faces?.[post.petId] ? (
        <View style={styles.face} pointerEvents="none" testID={`feed-face-${post.id}`}>
          <PetFace pet={faces[post.petId]} size={24} />
        </View>
      ) : null}
      {isVideo ? (
        <View style={styles.play} pointerEvents="none">
          <Text style={styles.playIcon}>▶</Text>
        </View>
      ) : null}
      <View style={[styles.badge, tags.length === 0 && styles.badgePlain]} pointerEvents="none" testID={`feed-badge-${post.id}`}>
        {tags.map((tag) => (
          <FeedTagIcon key={tag} tag={tag} size={20} color={theme.color.text} />
        ))}
        <Text style={styles.badgeText} testID={`feed-badge-time-${post.id}`}>
          {time}
        </Text>
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
    filters: { flexDirection: "row", alignItems: "center", gap: 8 },
    chips: { flex: 1, minWidth: 0 },
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
    // No tag: the time alone, the same room on both sides, so it sits in the middle of the pill.
    badgePlain: { paddingLeft: 9, justifyContent: "center" },
    badgeText: { fontSize: BADGE_TEXT, lineHeight: 16.1, fontWeight: "800", color: theme.color.text },
    face: { position: "absolute", top: 8, left: 8 },
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
