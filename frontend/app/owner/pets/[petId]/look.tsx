import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { PetSprite } from "../../../../components/pet/PetSprite";
import { Button } from "../../../../components/ui/Button";
import { Icon } from "../../../../components/ui/Icon";
import { ChoiceChips } from "../../../../components/ui/ChoiceChips";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { SegmentedControl } from "../../../../components/ui/SegmentedControl";
import { TextButton } from "../../../../components/ui/TextButton";
import { asHat } from "../../../../features/pets/items";
import { getPet, savePetLook } from "../../../../features/pets/petApi";
import { PET_BASES, asPetRecipe, presetFor, recipeFor, type ColorKey, type PetRecipe } from "../../../../features/pets/sprites/petLook";
import { PET_PRESETS, type PetPreset } from "../../../../features/pets/sprites/petPresets";
import { asPixelColors } from "../../../../features/pets/sprites/photoColors";
import { useIsAdmin } from "../../../../lib/admins";
import type { Pose } from "../../../../features/pets/sprites/scene";
import { useTheme, useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";
import type { Pet } from "../../../../types/db";

type Opt = { value: string; label: string };
const o = (pairs: [string, string][]): Opt[] => pairs.map(([value, label]) => ({ value, label }));

const UP_HEADS = (base: string) => !["floppy", "pug"].includes(PET_BASES[base].head);
const SWAP = ["dog", "blacklab", "beagle", "dalmatian", "maltese", "shiba", "jindo", "corgi", "husky", "frenchie"];
const FUR = ["#F6F1EA", "#EBD3B0", "#E8B886", "#E3A94F", "#E58A3C", "#B8622E", "#CDB394", "#8A5A3B", "#5C3A24", "#1E1A1A", "#7C8590", "#A0A4AA", "#C9CCD1", "#F2D2C6"]; // tokens-ok: pet fur swatches, not UI colors
const COLOR_NAMES: Partial<Record<ColorKey, string>> = { coat: "Coat", light: "Coat light", muzzle: "Muzzle", ear: "Ears", white: "White markings", dark: "Dark markings", tan: "Tan", patch: "Patch" };

/** What the preview shows; tapping it moves to the next. Turn goes round: front, side, back, the other side. */
const TURN: { pose: Pose; facing: "left" | "right" }[] = [
  { pose: { view: "front", action: "idle", frame: 0 }, facing: "right" },
  { pose: { view: "side", action: "idle", frame: 0 }, facing: "right" },
  { pose: { view: "back", action: "idle", frame: 0 }, facing: "right" },
  { pose: { view: "side", action: "idle", frame: 0 }, facing: "left" },
];
const POSES: { label: string; ms: number; at: (f: number) => { pose: Pose; facing: "left" | "right" } }[] = [
  { label: "Turn", ms: 700, at: (f) => TURN[f % 4] },
  { label: "Walk", ms: 180, at: (f) => ({ pose: { view: "side", action: "walk", frame: f % 4 }, facing: "right" }) },
  { label: "Front", ms: 600, at: (f) => ({ pose: { view: "front", action: "idle", frame: f % 2 }, facing: "right" }) },
  { label: "Back", ms: 600, at: (f) => ({ pose: { view: "back", action: "idle", frame: f % 2 }, facing: "right" }) },
];
const MIN_TILE = 80;
const GAP = 8;

/** The Pet maker (11.12c), admins only: start from a breed, change the looks, save to `pets.profile.pixel_look`. */
export default function PetLookScreen() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const admin = useIsAdmin();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const [pet, setPet] = useState<Pet | null | undefined>(undefined);
  // The look and the looks before it (Undo); `first` is the look the screen opened with (Start over).
  const [look, setLook] = useState<{ recipe: PetRecipe; history: PetRecipe[]; first: PetRecipe } | null>(null);
  const [startedFrom, setStartedFrom] = useState<string | null>(null);
  const [tab, setTab] = useState<"shape" | "marks" | "colors">("shape");
  const [pose, setPose] = useState(0);
  const [frame, setFrame] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [allBreeds, setAllBreeds] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getPet(petId)
      .then((p) => {
        setPet(p);
        if (p) {
          const colors = asPixelColors(p.profile?.pixel_colors);
          const r = recipeFor({ species: p.species, breed: p.breed, coat: p.profile?.coat, colors, weightKg: p.weight_kg, look: asPetRecipe(p.profile?.pixel_look) });
          setLook({ recipe: r, history: [], first: r });
        }
      })
      .catch(() => setPet(null));
  }, [petId]);

  useEffect(() => {
    const t = setInterval(() => setFrame((f) => f + 1), POSES[pose].ms);
    return () => clearInterval(t);
  }, [pose]);

  const cat = pet?.species === "cat";
  // The pet's own breed first (marked on its tile), then the rest of its species.
  const own = pet ? presetFor(pet.species, pet.breed) : null;
  const breeds = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = PET_PRESETS.filter((p) => PET_BASES[p.base].cat === cat && (!q || p.name.toLowerCase().includes(q)));
    return own ? [...list.filter((p) => p.name === own.name), ...list.filter((p) => p.name !== own.name)] : list;
  }, [cat, query, own]);

  if (!admin) return <Screen><EmptyState emoji="🐾" title="Looks are set by the Goldito team" message="Your pet's look comes from its profile." /></Screen>;
  if (pet === undefined || (pet && !look)) return <LoadingView />;
  if (!pet || !look) return <Screen><EmptyState emoji="🐾" title="Pet not found" message="It may have been removed." /></Screen>;

  const recipe = look.recipe;
  const change = (next: PetRecipe) => setLook((s) => (s ? { ...s, recipe: next, history: [...s.history.slice(-40), s.recipe] } : s));
  const undo = () => setLook((s) => (s && s.history.length ? { ...s, recipe: s.history[s.history.length - 1], history: s.history.slice(0, -1) } : s));
  const set = (patch: Partial<PetRecipe>) => change({ ...recipe, ...patch });
  const setColor = (key: ColorKey, hex: string) => {
    const colors = { ...(recipe.colors ?? {}), [key]: hex };
    if (key === "coat") colors.outline = shade(hex, 0.38);
    set({ colors });
  };
  const usePreset = (p: PetPreset) => {
    const { name, ...r } = p;
    change({ ...r, colors: { ...(r.colors ?? {}) } });
    setStartedFrom(name);
    // A breed replaces every edit, so the toast can take it back.
    toast.show(`Started from ${name}`, { undo: () => { undo(); setStartedFrom(null); } });
  };
  const save = async (look: PetRecipe | null) => {
    setSaving(true);
    try {
      await savePetLook(pet.id, look);
      toast.show(look ? "Look saved" : "Back to the breed look");
      router.back();
    } catch (e) {
      toast.show((e as Error).message, { tone: "error" });
      setSaving(false);
    }
  };

  const base = PET_BASES[recipe.base];
  const up = recipe.earType ? recipe.earType === "up" : UP_HEADS(recipe.base);
  const one = (key: keyof PetRecipe, fallback: string | number) => [String(recipe[key] ?? fallback)];
  const pickOne = (key: keyof PetRecipe, numeric = false) => (v: string[]) => v.length && set({ [key]: numeric ? Number(v[0]) : v[0] } as Partial<PetRecipe>);
  const shown = query || allBreeds ? breeds : breeds.slice(0, 12);
  const colorKeys = colorSlots(recipe, up);
  const preview = POSES[pose].at(frame);
  const cols = gridWidth ? Math.max(3, Math.floor((gridWidth + GAP) / (MIN_TILE + GAP))) : 4;
  const tile = gridWidth ? Math.floor((gridWidth - GAP * (cols - 1)) / cols) : MIN_TILE;

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${pet.name}, ${POSES[pose].label}. Tap to change the pose`}
        onPress={() => { setPose((i) => (i + 1) % POSES.length); setFrame(0); }}
        style={styles.stage}
        testID="look-preview"
      >
        <PetSprite species={pet.species} look={recipe} mood="calm" pose={preview.pose} facing={preview.facing} hat={asHat(pet.profile?.hat)} pixel={4} testID="look-sprite" />
        <Text style={styles.poseLabel} testID="look-pose">{`${POSES[pose].label} · tap to change`}</Text>
      </Pressable>
      <Screen
        contentStyle={styles.page}
        footer={
          <View style={styles.bar}>
            <Button label="Undo" variant="secondary" onPress={undo} disabled={!look.history.length} style={styles.barButton} testID="look-undo" />
            <Button label="Start over" variant="secondary" onPress={() => { change(look.first); setStartedFrom(null); }} style={styles.barButton} testID="look-start-over" />
            <Button label="Save" onPress={() => void save(recipe)} disabled={saving} style={styles.barButton} testID="look-save" />
          </View>
        }
      >
      <Step n={1} title="Pick the closest breed" />
      <View style={styles.search}>
        <Icon name="search" size={20} color={theme.color.textMuted} />
        <TextInput
          accessibilityLabel="Search breeds"
          placeholder={cat ? "Tabby, ragdoll, siamese" : "Golden, husky, corgi"}
          placeholderTextColor={theme.color.placeholder}
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          testID="look-breed-search"
        />
      </View>
      <View style={styles.breeds} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {shown.map((p) => (
          <Pressable
            key={p.name}
            accessibilityRole="button"
            accessibilityState={{ selected: startedFrom === p.name }}
            onPress={() => usePreset(p)}
            style={[styles.breed, { width: tile }, startedFrom === p.name && styles.breedOn]}
            testID={`look-breed-${p.name}`}
          >
            <PetSprite species={pet.species} look={p} mood="calm" pixel={2} />
            <Text style={styles.breedName} numberOfLines={2}>{p.name}</Text>
            {own?.name === p.name ? <Text style={styles.own} testID="look-breed-own">{`${pet.name}'s breed`}</Text> : null}
          </Pressable>
        ))}
      </View>
      {!query && breeds.length > 12 ? (
        <TextButton label={allBreeds ? "Show fewer" : `Show all ${breeds.length} ${cat ? "cats" : "dogs"}`} onPress={() => setAllBreeds(!allBreeds)} style={styles.center} testID="look-breed-more" />
      ) : null}

      <Step n={2} title="Change the looks" />
      <SegmentedControl
        options={[{ value: "shape", label: "Shape" }, { value: "marks", label: "Markings" }, { value: "colors", label: "Colors" }]}
        value={tab}
        onChange={setTab}
        testID="look-tabs"
      />
      {tab === "shape" ? (
        <View style={styles.group}>
          <Field label="Head shape">
            <ChoiceChips
              options={Object.entries(PET_BASES).filter(([, b]) => b.cat === cat).map(([value, b]) => ({ value, label: b.label }))}
              value={[recipe.base]}
              onChange={(v) => v.length && set({ base: v[0], ears: "default", earType: undefined })}
              testID="look-head"
            />
          </Field>
          {SWAP.includes(recipe.base) ? (
            <Field label="Ear type">
              <ChoiceChips options={o([["up", "Up"], ["floppy", "Floppy"]])} value={[up ? "up" : "floppy"]} onChange={(v) => v.length && set({ earType: v[0] as "up" | "floppy", ears: "default" })} testID="look-eartype" />
            </Field>
          ) : null}
          <Field label="Ears">
            <ChoiceChips
              options={up ? o([["default", "As drawn"], ["big", "Big"], ["tufts", "Tufts"], ["lynx", "Big + tufts"], [base.cat ? "folded" : "tipped", base.cat ? "Folded" : "Tipped over"]]) : o([["default", "As drawn"], ["long", "Long"]])}
              value={one("ears", "default")}
              onChange={pickOne("ears")}
              testID="look-ears"
            />
          </Field>
          <Field label="Cheeks"><ChoiceChips options={o([["regular", "Regular"], ["ruff", "Fluffy ruff"]])} value={one("cheeks", "regular")} onChange={pickOne("cheeks")} /></Field>
          <Field label="Nose"><ChoiceChips options={o([["base", "As drawn"], ["black", "Black"], ["brown", "Brown"], ["pink", "Pink"], ["liver", "Liver"]])} value={one("nose", "base")} onChange={pickOne("nose")} /></Field>
          <Field label="Build"><ChoiceChips options={o([["-1", "Slim"], ["0", "Regular"], ["1", "Chonky"]])} value={one("build", base.body[0])} onChange={pickOne("build", true)} testID="look-build" /></Field>
          <Field label="Legs"><ChoiceChips options={o([["-2", "Short"], ["0", "Regular"], ["1", "Long"]])} value={one("legs", base.body[1])} onChange={pickOne("legs", true)} /></Field>
          <Field label="Body length"><ChoiceChips options={o([["0", "Regular"], ["1", "Long"]])} value={one("length", 0)} onChange={pickOne("length", true)} /></Field>
          <Field label="Tail"><ChoiceChips options={o([["base", "As drawn"], ["wag", "Wagging"], ["curl", "Curled"], ["tip", "White tip"], ["none", "None"], ["cat", "Long"]])} value={one("tail", "base")} onChange={pickOne("tail")} /></Field>
        </View>
      ) : null}
      {tab === "marks" ? (
        <View style={styles.group}>
          <Field label="Coat"><ChoiceChips options={o([["smooth", "Smooth"], ["fluffy", "Fluffy"], ["long", "Long"]])} value={one("coat", "smooth")} onChange={pickOne("coat")} testID="look-coat" /></Field>
          <Field label="Face (any)">
            <ChoiceChips
              multi
              options={o([["mask", "Dark mask"], ["blaze", "White blaze"], ["whiteface", "White lower face"], ["tan", "Tan eyebrows"], ["points", "Color points"], ["spots", "Spots"], ["stripes", "Stripes"], ["patches", "Patches"], ["merle", "Merle"]])}
              value={recipe.face ?? []}
              onChange={(face) => set({ face })}
              testID="look-face"
            />
          </Field>
          <Field label="Body (any)">
            <ChoiceChips
              multi
              options={o([["saddle", "Dark saddle"], ["spots", "Spots"], ["stripes", "Stripes"], ["brindle", "Brindle"], ["merle", "Merle"], ["patches", "Patches"], ["points", "Color points"], ["socks", "White socks"], ["tan", "Tan legs"]])}
              value={recipe.body ?? []}
              onChange={(body) => set({ body })}
              testID="look-body"
            />
          </Field>
          <Field label="Chest"><ChoiceChips options={o([["base", "As drawn"], ["white", "White"], ["coat", "Coat"], ["tan", "Tan"], ["dark", "Dark"]])} value={one("chest", "base")} onChange={pickOne("chest")} /></Field>
          <Field label="Paws"><ChoiceChips options={o([["base", "As drawn"], ["white", "White"], ["coat", "Coat"], ["tan", "Tan"], ["dark", "Dark"]])} value={one("paws", "base")} onChange={pickOne("paws")} /></Field>
          <Field label="Eyes"><ChoiceChips options={o([["dark", "Dark"], ["amber", "Amber"], ["hazel", "Hazel"], ["green", "Green"], ["blue", "Blue"], ["odd", "Odd"]])} value={one("eyes", "dark")} onChange={pickOne("eyes")} testID="look-eyes" /></Field>
        </View>
      ) : null}
      {tab === "colors" ? (
        <View style={styles.group}>
          {colorKeys.map((key) => (
            <Field key={key} label={COLOR_NAMES[key] ?? key}>
              <View style={styles.swatches}>
                {FUR.map((hex) => {
                  const on = (recipe.colors?.[key] ?? "").toUpperCase() === hex;
                  return (
                    <Pressable
                      key={hex}
                      accessibilityRole="radio"
                      accessibilityLabel={`${COLOR_NAMES[key]} ${hex}`}
                      aria-checked={on}
                      onPress={() => setColor(key, hex)}
                      style={[styles.swatch, { backgroundColor: hex }, on && styles.swatchOn]}
                      testID={`look-color-${key}-${hex.slice(1)}`}
                    />
                  );
                })}
              </View>
            </Field>
          ))}
        </View>
      ) : null}

      <TextButton label="Use the breed look again" onPress={() => void save(null)} style={styles.center} testID="look-reset" />
      </Screen>
    </View>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stepRow} accessibilityRole="header">
      <View style={styles.stepDot}><Text style={styles.stepNum}>{n}</Text></View>
      <Text style={styles.h2}>{title}</Text>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

/** The color parts this look uses (the white, dark and tan only when a marking needs them). */
function colorSlots(r: PetRecipe, up: boolean): ColorKey[] {
  const marks = [...(r.face ?? []), ...(r.body ?? [])];
  const uses = (list: string[]) => list.some((m) => marks.includes(m));
  const keys: ColorKey[] = ["coat", "light", "muzzle"];
  if (!up || PET_BASES[r.base].keys.ear) keys.push("ear");
  if (uses(["blaze", "whiteface", "socks"]) || r.chest === "white" || r.paws === "white") keys.push("white");
  if (uses(["mask", "points", "spots", "patches", "merle", "saddle", "brindle"]) || r.chest === "dark" || r.paws === "dark") keys.push("dark");
  if (uses(["tan"]) || r.chest === "tan" || r.paws === "tan") keys.push("tan");
  if (uses(["patches"])) keys.push("patch");
  return keys;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k).toString(16).padStart(2, "0"));
  return `#${c.join("")}`.toUpperCase();
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    page: { gap: theme.spacing.md },
    stage: { alignItems: "center", justifyContent: "center", paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs, backgroundColor: theme.color.surface, borderBottomWidth: 1, borderBottomColor: theme.color.border },
    poseLabel: { fontSize: theme.fontSize.small, color: theme.color.textMuted, minHeight: 20 },
    stepRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginTop: theme.spacing.sm },
    stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary },
    stepNum: { color: theme.color.primaryText, fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold },
    h2: { flex: 1, fontSize: theme.fontSize.section, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    search: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: 48, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
    searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: theme.fontSize.body, color: theme.color.text },
    breeds: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
    breed: { minHeight: 44, alignItems: "center", gap: 4, padding: theme.spacing.xs, borderRadius: theme.radius.md, borderWidth: 2, borderColor: "transparent", backgroundColor: theme.color.surface },
    own: { fontSize: theme.fontSize.caption, fontWeight: theme.fontWeight.semibold, color: theme.color.primary },
    bar: { flexDirection: "row", gap: theme.spacing.sm },
    barButton: { flex: 1 },
    breedOn: { borderColor: theme.color.primary },
    breedName: { fontSize: theme.fontSize.small, color: theme.color.text, textAlign: "center" },
    center: { alignSelf: "center" },
    group: { gap: theme.spacing.md },
    field: { gap: theme.spacing.xs },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    swatches: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.color.border },
    swatchOn: { borderWidth: 3, borderColor: theme.color.primary },
  });
