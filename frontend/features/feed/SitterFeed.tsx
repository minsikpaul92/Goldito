import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { AddPhotoSheet } from "../../components/AddPhotoSheet";
import { FeedBrowser } from "../../components/FeedBrowser";
import { ALL_PETS, FeedPetPicker } from "../../components/FeedPetPicker";
import { FeedBarRight } from "../../components/FeedSwitch";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { listSitterBookings } from "../../lib/bookings";
import { UploadError, uploadMedia } from "../../lib/cloudinary";
import {
  FALLBACK_CAPTION,
  FEED_PAGE_SIZE,
  FeedTimelinePost,
  FeedTag,
  captionPhoto,
  createFeedPost,
  listFeedPosts,
} from "../../lib/feed";
import { PickedMedia } from "../../lib/media";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useNotifications } from "../../providers/NotificationsProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { FeedPet, feedPetsFromBookings } from "./caringPets";
import { usePetFaces } from "./usePetFaces";

type FeedState =
  | { status: "loading" }
  | { status: "ready"; posts: FeedTimelinePost[]; hasMore: boolean }
  | { status: "error"; message: string; posts: FeedTimelinePost[]; hasMore: boolean };

/**
 * The sitter's Moments tab (#345, Muk's trial): it opens on the pets in care together (a single pet when there is one)
 * with the same filterable mosaic as the owner's, and a pet chip first in the filter row narrows it to one pet. The chip
 * lists All pets (the pets in care), then a line, then the pets of stays that are over; with no pet in care it opens on
 * the latest of those. A photo added here is Only me or shared with the owner (Save); after the stay it can only be for
 * me. `?pet=` opens a given pet (a notice, a chat card).
 */
export function SitterFeed() {
  const { pet: petParam } = useLocalSearchParams<{ pet?: string }>();
  const { profile } = useSession();
  const sitterId = profile?.id;
  const [pets, setPets] = useState<FeedPet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const faces = usePetFaces((pets ?? []).map((p) => p.id));

  const load = useCallback(async () => {
    if (!sitterId) return;
    try {
      setPets(feedPetsFromBookings(await listSitterBookings(sitterId)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sitterId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // A link to a pet (`?pet=`) wins over what was picked before.
  useEffect(() => {
    if (petParam) setChosen(petParam);
  }, [petParam]);

  if (error && !pets) {
    return <EmptyState emoji="📸" title="Couldn't load pets" message={error} action={{ label: "Try again", onPress: () => void load() }} />;
  }
  if (!pets) return <LoadingView />;
  if (pets.length === 0) {
    return (
      <EmptyState
        emoji="📸"
        title="Share a moment"
        message="When you're caring for a pet, open them here to share photos with the owner."
      />
    );
  }

  const inCare = pets.filter((p) => p.caring);
  const past = pets.filter((p) => !p.caring);
  // Every pet in care together when there are two or more; else the one in care; else the latest past stay.
  const usual = inCare.length > 1 ? ALL_PETS : (inCare[0] ?? past[0]).id;
  const valid = chosen && (chosen === ALL_PETS ? inCare.length > 1 : pets.some((p) => p.id === chosen));
  const selection = valid ? chosen : usual;
  const selected = selection === ALL_PETS ? inCare : pets.filter((p) => p.id === selection);
  const groups = [
    { key: "care", hint: "In care", pets: inCare },
    { key: "past", hint: "Past stay", pets: past },
  ];
  return (
    <>
      <FeedBarRight signature={`${selection}|${pets.map((p) => p.id).join(",")}|${JSON.stringify(faces)}`}>
        <FeedPetPicker groups={groups} allPets={inCare} value={selection} onChange={setChosen} faces={faces} />
      </FeedBarRight>
      <SitterPetFeed key={selection} pets={selected} several={selection === ALL_PETS} faces={faces} />
    </>
  );
}

function SitterPetFeed({
  pets,
  several,
  faces,
}: {
  pets: FeedPet[];
  several: boolean;
  faces: Record<string, string | null>;
}) {
  const petIds = pets.map((p) => p.id);
  const idsKey = petIds.join(",");
  const [addPetId, setAddPetId] = useState<string | null>(null);
  // The pet a new photo is of: the pet on screen, or the one picked in the sheet when several are shown.
  const pet = pets.find((p) => p.id === addPetId) ?? pets[0];
  const petId = pet.id;
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const session = useSession();
  const currentUserId = session.status === "signedIn" ? session.profile.id : null;
  const { feedRevision } = useNotifications();

  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [adding, setAdding] = useState(false);
  /** While a photo is on its way: what is happening to it. */
  const [stage, setStage] = useState<"uploading" | "captioning" | null>(null);

  const loadPage = useCallback(
    async (offset: number, append: boolean, soft = false) => {
      if (!append && !soft) setFeed({ status: "loading" });
      try {
        const page = await listFeedPosts(idsKey.split(","), { offset, limit: FEED_PAGE_SIZE });
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
    [idsKey],
  );

  useEffect(() => {
    void loadPage(0, false);
  }, [loadPage]);

  // The owner shared a photo (5.9) or a post was deleted: refetch without a spinner.
  useEffect(() => {
    if (feedRevision === 0) return;
    void loadPage(0, false, true);
  }, [feedRevision, loadPage]);

  const loadMore = useCallback(async () => {
    if (feed.status !== "ready" || !feed.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(feed.posts.length, true);
    } finally {
      setLoadingMore(false);
    }
  }, [feed, loadingMore, loadPage]);

  const addPhoto = () => {
    if (stage) return;
    setAdding(true);
  };

  const closeAdd = () => {
    setAdding(false);
    setPicked(null);
  };

  const savePhoto = async ({ share, note, tag }: { share: boolean; note: string; tag: FeedTag | null }) => {
    if (!picked || stage) return;
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
        category: tag ?? written.category,
        role: "sitter",
        visibility: share ? "shared" : "private",
        note,
      });
      closeAdd();
      toast.show(share ? `Pawsted! ${pet.ownerName} can see it` : "Saved just for you");
      await loadPage(0, false, true);
    } catch (err) {
      const message =
        err instanceof UploadError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't save this photo. Try again.";
      errorDialog.show({ title: "Photo not saved", message, onRetry: () => void savePhoto({ share, note, tag }) });
    } finally {
      setStage(null);
    }
  };

  return (
    <View style={styles.safe} testID="sitter-pet-feed">
      <FeedBrowser
        posts={feed.status === "loading" ? [] : feed.posts}
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
        onRefresh={() => void loadPage(0, false, true)}
        faces={several ? Object.fromEntries(pets.map((p) => [p.id, { species: p.species, photo: faces[p.id], name: p.name }])) : undefined}
        emptyMessage={pet.caring ? `Tap + to share ${pet.name}'s day.` : "Photos you save for yourself show up here."}
        error={feed.status === "error" && feed.posts.length === 0 ? { message: feed.message, onRetry: () => void loadPage(0, false) } : null}
        testID="sitter-feed-list"
      />

      <View style={styles.fabRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add photo"
          disabled={stage != null}
          onPress={addPhoto}
          style={({ pressed }) => [styles.fab, (pressed || stage != null) && styles.fabPressed]}
          testID="feed-add-photo"
        >
          <Text style={styles.fabLabel}>+ Photo</Text>
        </Pressable>
      </View>

      <AddPhotoSheet
        visible={adding}
        picked={picked}
        onPicked={setPicked}
        pets={several ? pets.map((p) => ({ id: p.id, name: p.name, face: { species: p.species, photo: faces[p.id], name: p.name } })) : undefined}
        petId={petId}
        onPetChange={setAddPetId}
        shareWith={pet.ownerName}
        shareWithId={pet.ownerId}
        canShare={pet.caring}
        defaultShare={pet.caring}
        saving={stage != null}
        statusText={stage === "captioning" ? "Writing a caption…" : "Uploading…"}
        onClose={closeAdd}
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
