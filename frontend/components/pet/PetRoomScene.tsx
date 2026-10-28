import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, GestureResponderEvent, Image, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { thumbUrl } from "../../lib/cloudinary";
import { isoToZoned, timeToMinutes } from "../../features/schedule/dates";
import { atGoal, behaviorPose, poopVisible, type Goal } from "../../features/pets/petBehavior";
import { usePetBehavior, type PetEvent } from "../../features/pets/usePetBehavior";
import type { WallPhoto } from "../../features/pets/useLatestSitterPhoto";
import type { HatId } from "../../features/pets/sprites/hats";
import type { PetRecipe } from "../../features/pets/sprites/petLook";
import type { PixelColors } from "../../features/pets/sprites/photoColors";
import { POOP_SIZE, SCENE_SIZE, spritePoop } from "../../features/pets/sprites/scene";
import { SIZE_SCALE, petSize } from "../../features/pets/sprites/sprites";
import type { PetMood } from "../../lib/petStatus";
import { useTheme } from "../../providers/ThemeProvider";
import type { Species } from "../../types/db";
import { useReduceMotion } from "../ui/useReduceMotion";
import { PetSprite } from "./PetSprite";
import { PixelGrid } from "./PixelGrid";
import {
  BALL,
  BASE_Y,
  BED,
  BOWL,
  BUBBLE,
  CLOUD,
  DUSK_SUN,
  FLOOR_Y,
  FOOD,
  HEART,
  MINI_BOWL,
  MOON,
  PHOTO_FRAME,
  ROOM_COLOR,
  ROOM_H,
  ROOM_W,
  RUG,
  SKY,
  SPARK,
  SUN,
  ZZZ,
  pixelsOf,
} from "./roomArt";

type Props = {
  name: string;
  species: Species;
  coat?: unknown;
  breed?: string | null;
  weightKg?: number | null;
  colors?: PixelColors | null;
  hat?: HatId | null;
  look?: PetRecipe | null;
  /** From today's check-ins (`derivePetStatus`): what the bed, the bowl and the bubble show. */
  mood: PetMood;
  /** The sitter logged a skipped or light meal: the bowl is empty. */
  hungry: boolean;
  event?: PetEvent | null;
  /** The newest photo the sitter posted: it hangs on the wall. */
  photo?: WallPhoto | null;
  /** Read out for the room (the caption under it says the same in words). */
  label: string;
  testID?: string;
  spriteTestID?: string;
};

/** The window's sky by the clock (app timezone): day, evening, night. */
function skyNow(): keyof typeof SKY {
  const minutes = timeToMinutes(isoToZoned(new Date().toISOString()).time);
  if (minutes >= 7 * 60 && minutes < 17 * 60) return "day";
  if (minutes >= 17 * 60 && minutes < 20 * 60) return "evening";
  return "night";
}

/** Room x (room pixels) where things are: the pet walks between ROAM_FROM and ROAM_TO, in front of the bed. */
const ROAM_FROM = 2;
const ROAM_TO = 70;
const BED_X = 74;
/** The middle of the mattress (bed columns 1 to 35). */
const MATTRESS_MID = BED_X + 18;
const BOWL_X = 6;
const AT_BOWL_X = 18;
const UNDER_PHOTO_X = 44;
/** Effects (hearts, ball, bubble, sparkle) move on their own clock. */
const FX_MS = 120;
/** The bubble shows for about 3 seconds when something happens (the room opens, the mood changes, a pat), then rests. */
const BUBBLE_TICKS = 26;
/** Where the ball rests as a toy until someone plays with it (room pixels, on the floor between the bowl and the rug). */
const TOY_X = 24;
/** A pat lasts this many effect ticks (about 1.6 s); a woken pet keeps one eye open for about 1.4 s. */
const PAT_TICKS = 14;
const WAKE_TICKS = 12;
/** A new photo sparkles for about 2.5 s; the pet looks up at it for about 6 s. */
const PHOTO_SPARKLE = 21;
const PHOTO_LOOK = 50;
/** A photo this fresh counts as new when the room opens. */
const FRESH_PHOTO_MS = 30 * 60_000;

type Heart = { id: number; x: number; y: number; life: number };
type Ball = { x: number; v: number; kicks: number; rest: number };

/**
 * The owner's pet room (Pet room tab on Home; Mook's room play, Oct 27). A pixel room that matches the pixel pet: a
 * window that follows the clock, a rug, a bowl that is empty when the sitter logged a skipped meal, a bed the pet curls
 * up on when it naps, and the newest sitter photo in a frame on the wall. Play that is never saved: tap the pet to pat
 * it, toss a ball. A thought bubble says the status the Tamagotchi way. The caption under the room says it in words.
 * Reduce motion: the pet stands still at its spot, nothing flies, and the bubble just shows.
 */
export function PetRoomScene(props: Props) {
  const theme = useTheme();
  const { name, species, coat, breed, weightKg, colors, hat, look, mood, hungry, event, photo, label, testID, spriteTestID } = props;
  const still = useReduceMotion();
  const [width, setWidth] = useState(0);
  const fit = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Room pixels to screen px: a whole number, so the furniture and the pet line up pixel for pixel.
  const p = Math.max(2, Math.floor(width / ROOM_W));
  const ox = Math.floor((width - ROOM_W * p) / 2);
  const petPx = Math.max(2, Math.floor(p * SIZE_SCALE[petSize(species, weightKg)]));
  const k = petPx / p; // one sprite pixel in room pixels
  const petW = SCENE_SIZE * k; // the pet's width in room pixels
  // Sprite pixels (what the behavior counts in) from a room x.
  const toU = (roomX: number) => Math.round(((roomX - ROAM_FROM) * p) / petPx);
  const maxX = width > 0 ? toU(ROAM_TO) : 0;

  // ---- Play state: pats, a woken eye, the ball, a new photo ----
  const [fx, setFx] = useState(0);
  const [pat, setPat] = useState(0);
  const [wake, setWake] = useState(0);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [ball, setBall] = useState<Ball | null>(null);
  const [photoNew, setPhotoNew] = useState(0);
  const [photoLook, setPhotoLook] = useState(0);
  const [bubble, setBubble] = useState(BUBBLE_TICKS);
  // The play hint under the room goes away once the owner has played (this visit).
  const [played, setPlayed] = useState(false);
  useEffect(() => setBubble(BUBBLE_TICKS), [mood, hungry]);
  const sleeping = mood === "sleepy" && wake <= 0;
  // Where the pet stood on the last frame: which side of a new ball it runs to.
  const lastX = useRef(0);

  // A newer photo than the one on the wall (or a fresh one when the room opens): sparkle, and the pet looks up at it.
  const seenPhoto = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!photo) return;
    const fresh = Date.now() - Date.parse(photo.takenAt) < FRESH_PHOTO_MS;
    if ((seenPhoto.current !== undefined && seenPhoto.current !== photo.id) || (seenPhoto.current === undefined && fresh)) {
      setPhotoNew(PHOTO_SPARKLE);
      setBubble(BUBBLE_TICKS);
      if (mood !== "sleepy") setPhotoLook(PHOTO_LOOK);
    }
    seenPhoto.current = photo.id;
  }, [photo, mood]);

  // Where the pet goes on its own: after the ball, under a new photo, to its bed when sleepy, to its bowl when hungry.
  const goal: Goal | null = useMemo(() => {
    if (width === 0) return null;
    // Being patted: it stops where it is and looks at you.
    if (pat > 0 && mood !== "sleepy") return { x: lastX.current, then: "look" };
    if (ball && ball.rest === 0) {
      const ahead = (petX: number) => petX + petW / 2 < ball.x + 4;
      return { x: toU(ahead(lastX.current) ? ball.x - 27 * k : ball.x + 8 - 5 * k), then: "look", speed: 2 };
    }
    if (photoLook > 0 && photo) return { x: toU(UNDER_PHOTO_X), then: "look" };
    if (mood === "sleepy") return { x: toU(MATTRESS_MID - petW / 2), then: "lie", speed: 2 };
    if (hungry) return { x: toU(AT_BOWL_X), then: "look" };
    return null;
    // lastX is read on purpose, not watched: the side of the ball is picked when the goal is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, ball?.x, ball?.rest, photoLook > 0, pat > 0, !!photo, mood, hungry, p, petPx]);

  const b = usePetBehavior(mood, maxX, still, event ?? null, goal);
  lastX.current = b.x;
  const petX = still ? (goal ? goal.x : Math.floor(maxX / 2)) : Math.min(b.x, goal ? Number.MAX_SAFE_INTEGER : maxX);
  const pose = still
    ? goal?.then === "lie"
      ? { view: "side" as const, action: "lie" as const, frame: 0 }
      : { view: "front" as const, action: "idle" as const, frame: 0 }
    : behaviorPose(b);
  const onBed = mood === "sleepy" && pose.action === "lie" && Math.abs(petX - toU(MATTRESS_MID - petW / 2)) < 1;
  const petRoomX = ROAM_FROM + (petX * petPx) / p;

  // ---- The effect clock: hearts rise, the ball rolls, the bubble comes and goes ----
  const bRef = useRef(b);
  bRef.current = b;
  const goalRef = useRef(goal);
  goalRef.current = goal;
  useEffect(() => {
    const timer = setInterval(() => {
      setFx((t) => t + 1);
      setPat((v) => Math.max(0, v - 1));
      setWake((v) => Math.max(0, v - 1));
      setPhotoNew((v) => Math.max(0, v - 1));
      setPhotoLook((v) => Math.max(0, v - 1));
      setBubble((v) => Math.max(0, v - 1));
      setHearts((hs) => hs.map((h) => ({ ...h, y: still ? h.y : h.y - 0.6, life: h.life - 1 })).filter((h) => h.life > 0));
      setBall((bl) => {
        if (!bl) return bl;
        if (bl.rest > 0) return bl.rest > 60 ? null : { ...bl, rest: bl.rest + 1 };
        let { x, v, kicks } = bl;
        const g = goalRef.current;
        // The pet reached the ball: it noses it along.
        if (v === 0 && g && atGoal(bRef.current, g)) {
          v = (bRef.current.facing === "right" ? 1 : -1) * (2 + Math.random());
          kicks += 1;
        }
        if (v !== 0) {
          x += v;
          v *= 0.88;
          if (x < 2 || x > ROOM_W - 10) {
            v = -v;
            x = Math.max(2, Math.min(ROOM_W - 10, x));
          }
          if (Math.abs(v) < 0.15) v = 0;
        }
        return { x, v, kicks, rest: v === 0 && kicks >= 3 ? 1 : 0 };
      });
    }, FX_MS);
    return () => clearInterval(timer);
  }, [still]);

  // ---- Play ----
  const patPet = () => {
    if (sleeping) {
      setWake(WAKE_TICKS);
      AccessibilityInfo.announceForAccessibility(`${name} opens one eye`);
      return;
    }
    setPat(PAT_TICKS);
    setBubble(BUBBLE_TICKS);
    setPlayed(true);
    const head = BASE_Y - petW;
    setHearts((hs) => [...hs, ...[0, 1, 2].map((i) => ({ id: Date.now() + i, x: petRoomX + petW / 2 - 7 + i * 5, y: head - 2 - (i % 2) * 2, life: still ? 14 : 22 + i * 3 }))]);
    AccessibilityInfo.announceForAccessibility(`${name} loves that`);
  };
  const toss = (roomX: number) => {
    setPlayed(true);
    setBall({ x: Math.max(2, Math.min(ROOM_W - 10, roomX - 4)), v: 0, kicks: 0, rest: 0 });
    AccessibilityInfo.announceForAccessibility(`${name} spots the ball`);
  };
  // Where on the floor: the tap's window x less the floor's (press events on web don't always carry locationX).
  const floorRef = useRef<View>(null);
  const tossOnFloor = (e: GestureResponderEvent) => {
    const pageX = e.nativeEvent.pageX;
    floorRef.current?.measureInWindow((fx) => {
      const x = (pageX - fx - ox) / p;
      if (Number.isFinite(x)) toss(x);
    });
  };

  // ---- Drawing helpers ----
  const at = (x: number, y: number) => ({ position: "absolute" as const, left: ox + Math.round(x * p), top: Math.round(y * p) });
  const grid = (art: Parameters<typeof pixelsOf>[0]) => <PixelGrid pixels={pixelsOf(art)} pixel={p} />;
  const sky = skyNow();
  const height = ROOM_H * p;
  const face: PetMood = pat > 0 || photoLook > 0 ? "excited" : mood === "sleepy" && wake > 0 ? "calm" : mood;
  const bounce = pat > 0 && !still && fx % 4 < 2 ? p : 0;
  const petBottom = (ROOM_H - BASE_Y) * p + (onBed ? 6 * p : 0) + bounce;
  const petLeft = ox + Math.round(petRoomX * p);
  const spriteSize = SCENE_SIZE * petPx;
  const showBubble = still || bubble > 0;
  const bubbleX = Math.min(ROOM_W - 14, petRoomX + petW * 0.62);
  const bubbleY = BASE_Y - petW - (onBed ? 6 : 0) - 4;
  const bubbleIcon = pat > 0 || mood === "excited" ? HEART : mood === "sleepy" ? ZZZ : mood === "hungry" || hungry ? MINI_BOWL : SPARK;
  const iconX = bubbleIcon === MINI_BOWL ? 3 : bubbleIcon === ZZZ ? 3 : 4;
  const poop = useMemo(() => spritePoop(), []);
  const crisp = Platform.OS === "web" ? ({ imageRendering: "pixelated" } as object) : null;
  const photoUri = photo ? thumbUrl(photo.publicId, 16) : "";

  return (
    <View style={styles.root}>
      <View
        accessibilityRole="image"
        accessibilityLabel={label}
        onLayout={fit}
        style={[styles.room, { height: width > 0 ? height : undefined }]}
        testID={testID}
      >
        {width > 0 ? (
          <>
            {/* Wall with a few soft stripes, the baseboard, the floor: quiet, so the pet stands out. */}
            <View style={[styles.fill, { height: FLOOR_Y * p, backgroundColor: ROOM_COLOR.wall }]} />
            {Array.from({ length: Math.ceil(ROOM_W / 20) }, (_, i) => (
              <View key={`s${i}`} style={[at(9 + i * 20, 0), { width: 2 * p, height: FLOOR_Y * p, backgroundColor: ROOM_COLOR.stripe }]} />
            ))}
            <View style={[styles.fill, { top: (FLOOR_Y - 2) * p, height: 2 * p, backgroundColor: ROOM_COLOR.baseboard }]} />
            <View style={[styles.fill, { top: FLOOR_Y * p, bottom: 0, backgroundColor: ROOM_COLOR.floor }]} />
            {[0, 1].map((r) => (
              <View key={`p${r}`} style={[styles.fill, { top: (FLOOR_Y + 8 + r * 10) * p, height: p, backgroundColor: ROOM_COLOR.plank }]} />
            ))}
            {/* The window: the sky follows the clock. */}
            <View style={[at(8, 8), { width: 30 * p, height: 24 * p, backgroundColor: ROOM_COLOR.frame }]} />
            <View style={[at(10, 10), { width: 26 * p, height: 18 * p, backgroundColor: SKY[sky] }]} />
            <View style={[at(22, 10), { width: 2 * p, height: 18 * p, backgroundColor: ROOM_COLOR.frame }]} />
            <View style={[at(8, 30), { width: 30 * p, height: 3 * p, backgroundColor: ROOM_COLOR.baseboard }]} />
            <View style={at(29, 13)}>{grid(sky === "night" ? MOON : sky === "day" ? SUN : DUSK_SUN)}</View>
            {sky === "day" ? <View style={at(12, 19)}>{grid(CLOUD)}</View> : null}
            {sky === "night"
              ? [[13, 13], [17, 21], [27, 24]].map(([x, y]) => <View key={`${x}`} style={[at(x, y), { width: p, height: p, backgroundColor: ROOM_COLOR.moon }]} />)
              : null}
            {/* The newest sitter photo, shrunk so it hangs as pixel art; it sparkles when it is new. */}
            {photo ? (
              <>
                <View style={[at(PHOTO_FRAME.x + 9, PHOTO_FRAME.y - 3), { width: 2 * p, height: 3 * p, backgroundColor: "#5A3A22" }]} />
                <View style={[at(PHOTO_FRAME.x, PHOTO_FRAME.y), { width: PHOTO_FRAME.w * p, height: PHOTO_FRAME.h * p, backgroundColor: "#B5652E" }]} />
                <View style={[at(PHOTO_FRAME.x + 1, PHOTO_FRAME.y + 1), { width: (PHOTO_FRAME.w - 2) * p, height: (PHOTO_FRAME.h - 2) * p, backgroundColor: "#E9C46A" }]} />
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: photoUri }}
                  resizeMode="cover"
                  style={[at(PHOTO_FRAME.x + PHOTO_FRAME.inset, PHOTO_FRAME.y + PHOTO_FRAME.inset), { width: 16 * p, height: 13 * p }, crisp]}
                  testID={testID ? `${testID}-photo` : undefined}
                />
                {photoNew > 0 && !still && photoNew % 4 < 2 ? (
                  <>
                    <View style={at(PHOTO_FRAME.x - 4, PHOTO_FRAME.y - 3)}>{grid(SPARK)}</View>
                    <View style={at(PHOTO_FRAME.x + PHOTO_FRAME.w - 1, PHOTO_FRAME.y + PHOTO_FRAME.h - 5)}>{grid(SPARK)}</View>
                  </>
                ) : null}
              </>
            ) : null}
            {/* Rug, bowl (empty when hungry), bed. */}
            <View style={at(36, 70)}>{grid(RUG)}</View>
            {hungry ? null : (
              <View style={at(BOWL_X, 66)} testID={testID ? `${testID}-food` : undefined}>
                {grid(FOOD)}
              </View>
            )}
            <View style={at(BOWL_X, 68)} testID={testID ? `${testID}-bowl` : undefined}>
              {grid(BOWL)}
            </View>
            <View style={at(BED_X, 61)} testID={testID ? `${testID}-bed` : undefined}>
              {grid(BED)}
            </View>
            {/* The floor takes a tap: the ball lands there. */}
            <Pressable
              ref={floorRef}
              accessible={false}
              onPress={tossOnFloor}
              style={[styles.fill, { top: FLOOR_Y * p, bottom: 0 }]}
              testID={testID ? `${testID}-floor` : undefined}
            />
            {b.poops.map((pp) => (
              <View
                key={pp.id}
                pointerEvents="none"
                style={{ position: "absolute", left: ox + ROAM_FROM * p + pp.x * petPx, bottom: (ROOM_H - BASE_Y) * p, width: POOP_SIZE.w * petPx, height: POOP_SIZE.h * petPx, opacity: poopVisible(pp) ? 1 : 0 }}
              >
                <PixelGrid pixels={poop} pixel={petPx} />
              </View>
            ))}
            {ball ? (
              <View pointerEvents="none" style={at(ball.x, BASE_Y - 8)} testID={testID ? `${testID}-ball` : undefined}>
                {grid(BALL)}
              </View>
            ) : (
              // The ball waits on the floor: tap it to toss it (the hit area is 44 px or more).
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Toss the ball"
                onPress={() => toss(48 + Math.random() * 16)}
                style={[at(TOY_X + 4, BASE_Y - 4), styles.toy, { marginLeft: -22, marginTop: -22 }]}
                testID={testID ? `${testID}-toss` : undefined}
              >
                {grid(BALL)}
              </Pressable>
            )}
            {/* The pet, with a tap area bigger than the sprite: a pat. */}
            <View pointerEvents="none" style={{ position: "absolute", left: petLeft, bottom: petBottom, width: spriteSize, height: spriteSize }}>
              <PetSprite
                species={species}
                coat={coat}
                breed={breed}
                colors={colors}
                weightKg={weightKg}
                look={look}
                hat={hat}
                mood={face}
                pose={pose}
                facing={still ? "right" : b.facing}
                pixel={petPx}
                testID={spriteTestID}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Pat ${name}`}
              onPress={patPet}
              style={{
                position: "absolute",
                left: petLeft - 8,
                bottom: Math.max(0, petBottom - 8),
                width: Math.max(44, spriteSize + 16),
                height: Math.max(44, spriteSize + 8),
              }}
              testID={testID ? `${testID}-pat` : undefined}
            />
            {hearts.map((h) => (
              <View key={h.id} pointerEvents="none" style={at(h.x, h.y)} testID={testID ? `${testID}-heart` : undefined}>
                {grid(HEART)}
              </View>
            ))}
            {showBubble ? (
              <View pointerEvents="none" style={at(bubbleX, bubbleY - 6)} testID={testID ? `${testID}-bubble` : undefined}>
                {grid(BUBBLE)}
                <View style={{ position: "absolute", left: iconX * p, top: (bubbleIcon === ZZZ ? 0.5 : 2) * p }}>{grid(bubbleIcon)}</View>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
      {played ? null : (
        <Text style={[styles.hint, { color: theme.color.textMuted }]} testID={testID ? `${testID}-hint` : undefined}>
          {`Tap ${name} to say hi, or the ball to play.`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  room: { alignSelf: "stretch", minHeight: 160, borderRadius: 20, overflow: "hidden", backgroundColor: ROOM_COLOR.wall },
  fill: { position: "absolute", left: 0, right: 0, top: 0 },
  toy: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 13, lineHeight: 18 },
});
