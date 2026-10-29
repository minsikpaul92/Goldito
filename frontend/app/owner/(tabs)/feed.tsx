import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddPhotoSheet } from "../../../components/AddPhotoSheet";
import { FeedBrowser } from "../../../components/FeedBrowser";
import { ALL_PETS, FeedPetPicker } from "../../../components/FeedPetPicker";
import { FeedBarRight, FeedSwitch } from "../../../components/FeedSwitch";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { useInCare } from "../../../features/care/useInCare";
import { OwnerDiaryBook } from "../../../features/diary/OwnerDiaryBook";
import { usePetFaces } from "../../../features/feed/usePetFaces";
import { useMyPets } from "../../../features/pets/useMyPets";
import { UploadError, uploadMedia } from "../../../lib/cloudinary";
import {
  FALLBACK_CAPTION,
  FEED_PAGE_SIZE,
  FeedTag,
  FeedTimelinePost,
  createFeedPost,
  listFeedPosts,
} from "../../../lib/feed";
import { PickedMedia } from "../../../lib/media";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useNotifications } from "../../../providers/NotificationsProvider";
import { useSession } from "../../../providers/SessionProvider";
import { useErrorDialog } from "../../../providers/ErrorDialogProvider";
import { useToast } from "../../../providers/ToastProvider";
import { Theme } from "../../../theme/themes";
import { useWords } from "../../../features/settings/playfulWords";

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
  const words = useWords();
  const errorDialog = useErrorDialog();
  const session = useSession();
  const currentUserId = session.status === "signedIn" ? session.profile.id : null;
  const { status: petsStatus, pets, error: petsError, reload: reloadPets } = useMyPets();
  // A notice opens this screen on the pet it is about (`?pet=`).
  const { pet: petParam } = useLocalSearchParams<{ pet?: string }>();
  // "all" (every pet together, the default with two or more) or one pet's id.
  const [petSel, setPetSel] = useState<string | null>(null);
  const [addPetId, setAddPetId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const inCare = useInCare();

  useEffect(() => {
    if (pets.length === 0) {
      setPetSel(null);
      return;
    }
    const wanted = petParam && pets.some((p) => p.id === petParam) ? petParam : null;
    const usual = pets.length > 1 ? ALL_PETS : pets[0].id;
    setPetSel((current) => wanted ?? (current && (current === ALL_PETS ? pets.length > 1 : pets.some((p) => p.id === current)) ? current : usual));
  }, [pets, petParam]);

  const selectedIds = petSel === ALL_PETS ? pets.map((p) => p.id) : petSel ? [petSel] : [];
  const selKey = selectedIds.join(",");
  const faces = usePetFaces(pets.map((p) => p.id));

  const loadPage = useCallback(
    async (offset: number, append: boolean, soft = false) => {
      if (!selKey) return;
      if (!append && !soft) setFeed({ status: "loading" });
      try {
        const page = await listFeedPosts(selKey.split(","), { offset, limit: FEED_PAGE_SIZE });
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
    [selKey],
  );

  useEffect(() => {
    if (!selKey) {
      if (petsStatus === "ready") setFeed({ status: "ready", posts: [], hasMore: false });
      return;
    }
    void loadPage(0, false);
  }, [selKey, petsStatus, loadPage]);

  useEffect(() => {
    if (!selKey || feedRevision === 0) return;
    void loadPage(0, false, true);
  }, [feedRevision, selKey, loadPage]);

  const loadMore = useCallback(async () => {
    if (feed.status !== "ready" || !feed.hasMore || loadingMore || !selKey) return;
    setLoadingMore(true);
    try {
      await loadPage(feed.posts.length, true);
    } finally {
      setLoadingMore(false);
    }
  }, [feed, loadingMore, selKey, loadPage]);

  // The pet a new photo is of: the pet on screen, or the one picked in the sheet when every pet is shown.
  const targetPetId = petSel === ALL_PETS ? (addPetId && pets.some((p) => p.id === addPetId) ? addPetId : pets[0]?.id) : petSel;
  const caring = targetPetId != null && inCare[targetPetId] != null;

  const addPhoto = () => {
    if (!targetPetId || saving) return;
    setAdding(true);
  };

  const closeAdd = () => {
    setAdding(false);
    setPicked(null);
  };

  const savePhoto = async ({ share, note, tag }: { share: boolean; note: string; tag: FeedTag | null }) => {
    if (!targetPetId || !picked || saving) return;
    setSaving(true);
    try {
      const kind = picked.file.type.startsWith("video/") ? "video" : "image";
      const uploaded = await uploadMedia({
        petId: targetPetId,
        purpose: "feed",
        file: picked.file,
        trim: picked.trim,
        resourceType: kind,
      });
      await createFeedPost({
        petId: targetPetId,
        mediaId: uploaded.mediaId,
        caption: FALLBACK_CAPTION,
        captionSource: "fallback",
        category: tag,
        role: "owner",
        visibility: share ? "shared" : "private",
        note,
      });
      closeAdd();
      const pet = pets.find((p) => p.id === targetPetId);
      toast.show(share ? words("photoShared", { pet, name: inCare[targetPetId]?.sitterName ?? "your sitter" }) : words("savedPrivate", { pet }));
      await loadPage(0, false, true);
    } catch (err) {
      errorDialog.show({
        title: "Photo not saved",
        message:
          err instanceof UploadError || err instanceof Error ? err.message : "Couldn't save this photo. Try again.",
        onRetry: () => void savePhoto({ share, note, tag }),
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
          icon="camera"
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
        <EmptyState icon="paw" title="No pets yet" message="Add a pet on Home first." />
      </SafeAreaView>
    );
  }

  const posts = feed.status === "loading" ? [] : feed.posts;
  const petOptions = pets.map((p) => ({ id: p.id, name: p.name, species: p.species }));
  const petGroups = [{ key: "mine", pets: petOptions }];
  // With several pets together each photo carries its pet's face.
  const facePets =
    petSel === ALL_PETS ? Object.fromEntries(pets.map((p) => [p.id, { species: p.species, photo: faces[p.id], name: p.name }])) : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <FeedBarRight signature={`${petSel ?? ALL_PETS}|${petOptions.map((p) => p.id).join(",")}|${JSON.stringify(faces)}`}>
        <FeedPetPicker groups={petGroups} allPets={petOptions} value={petSel ?? ALL_PETS} onChange={setPetSel} faces={faces} />
      </FeedBarRight>
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
        faces={facePets}
        petSpecies={Object.fromEntries(pets.map((p) => [p.id, p.species]))}
        onRefresh={() => void loadPage(0, false, true)}
        emptyMessage="Your sitter will share photos here."
        error={feed.status === "error" && posts.length === 0 ? { message: feed.message, onRetry: () => void loadPage(0, false) } : null}
        testID="owner-feed-list"
      />

      <View style={styles.fabRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add photo"
          disabled={saving}
          onPress={addPhoto}
          style={({ pressed }) => [styles.fab, (pressed || saving) && styles.fabPressed]}
          testID="feed-add-photo"
        >
          <Text style={styles.fabLabel}>+ Photo</Text>
        </Pressable>
      </View>

      <AddPhotoSheet
        visible={adding}
        picked={picked}
        onPicked={setPicked}
        pets={
          petSel === ALL_PETS
            ? petOptions.map((p) => ({ id: p.id, name: p.name, face: { species: p.species, photo: faces[p.id], name: p.name } }))
            : undefined
        }
        petId={targetPetId ?? undefined}
        onPetChange={setAddPetId}
        shareWithId={targetPetId ? inCare[targetPetId]?.sitterId : undefined}
        shareWith={targetPetId ? (inCare[targetPetId]?.sitterName ?? "your sitter") : "your sitter"}
        canShare={caring}
        defaultShare={false}
        saving={saving}
        onClose={closeAdd}
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
