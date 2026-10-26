import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PetSprite } from "../../../../components/pet/PetSprite";
import { Button } from "../../../../components/ui/Button";
import { ChoiceChips } from "../../../../components/ui/ChoiceChips";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { SegmentedControl } from "../../../../components/ui/SegmentedControl";
import { TextButton } from "../../../../components/ui/TextButton";
import { TextField } from "../../../../components/ui/TextField";
import { asHat } from "../../../../features/pets/items";
import { getPet, savePetLook } from "../../../../features/pets/petApi";
import { PET_BASES, asPetRecipe, recipeFor, type ColorKey, type PetRecipe } from "../../../../features/pets/sprites/petLook";
import { PET_PRESETS, type PetPreset } from "../../../../features/pets/sprites/petPresets";
import { asPixelColors } from "../../../../features/pets/sprites/photoColors";
import { useIsAdmin } from "../../../../lib/admins";
import type { Pose } from "../../../../features/pets/sprites/scene";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";
import type { Pet } from "../../../../types/db";

type Opt = { value: string; label: string };
const o = (pairs: [string, string][]): Opt[] => pairs.map(([value, label]) => ({ value, label }));

const UP_HEADS = (base: string) => !["floppy", "pug"].includes(PET_BASES[base].head);
const SWAP = ["dog", "blacklab", "beagle", "dalmatian", "maltese", "shiba", "jindo", "corgi", "husky", "frenchie"];
const FUR = ["#F6F1EA", "#EBD3B0", "#E8B886", "#E3A94F", "#E58A3C", "#B8622E", "#CDB394", "#8A5A3B", "#5C3A24", "#1E1A1A", "#7C8590", "#A0A4AA", "#C9CCD1", "#F2D2C6"]; // tokens-ok: pet fur swatches, not UI colors
const COLOR_NAMES: Partial<Record<ColorKey, string>> = { coat: "Coat", light: "Coat light", muzzle: "Muzzle", ear: "Ears", white: "White markings", dark: "Dark markings", tan: "Tan", patch: "Patch" };

const POSES: { value: string; label: string; pose: (f: number) => Pose }[] = [
  { value: "front", label: "Front", pose: (f) => ({ view: "front", action: "idle", frame: f % 2 }) },
  { value: "side", label: "Side", pose: (f) => ({ view: "side", action: "idle", frame: f % 2 }) },
  { value: "walk", label: "Walk", pose: (f) => ({ view: "side", action: "walk", frame: f % 4 }) },
  { value: "back", label: "Back", pose: (f) => ({ view: "back", action: "idle", frame: f % 2 }) },
];

/** The Pet maker (11.12c), admins only: start from a breed, change the looks, save to `pets.profile.pixel_look`. */
export default function PetLookScreen() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const admin = useIsAdmin();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const [pet, setPet] = useState<Pet | null | undefined>(undefined);
  const [recipe, setRecipe] = useState<PetRecipe | null>(null);
  const [startedFrom, setStartedFrom] = useState<string | null>(null);
  const [tab, setTab] = useState<"shape" | "marks" | "colors">("shape");
  const [pose, setPose] = useState("front");
  const [frame, setFrame] = useState(0);
  const [query, setQuery] = useState("");
  const [allBreeds, setAllBreeds] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getPet(petId)
      .then((p) => {
        setPet(p);
        if (p) {
          const colors = asPixelColors(p.profile?.pixel_colors);
          setRecipe(recipeFor({ species: p.species, breed: p.breed, coat: p.profile?.coat, colors, weightKg: p.weight_kg, look: asPetRecipe(p.profile?.pixel_look) }));
        }
      })
      .catch(() => setPet(null));
  }, [petId]);

  useEffect(() => {
    const t = setInterval(() => setFrame((f) => f + 1), pose === "walk" ? 180 : 600);
    return () => clearInterval(t);
  }, [pose]);

  const cat = pet?.species === "cat";
  const breeds = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PET_PRESETS.filter((p) => PET_BASES[p.base].cat === cat && (!q || p.name.toLowerCase().includes(q)));
  }, [cat, query]);

  if (!admin) return <Screen><EmptyState emoji="🐾" title="Looks are set by the Goldito team" message="Your pet's look comes from its profile." /></Screen>;
  if (pet === undefined || (pet && !recipe)) return <LoadingView />;
  if (!pet || !recipe) return <Screen><EmptyState emoji="🐾" title="Pet not found" message="It may have been removed." /></Screen>;

  const set = (patch: Partial<PetRecipe>) => setRecipe({ ...recipe, ...patch });
  const setColor = (key: ColorKey, hex: string) => {
    const colors = { ...(recipe.colors ?? {}), [key]: hex };
    if (key === "coat") colors.outline = shade(hex, 0.38);
    set({ colors });
  };
  const usePreset = (p: PetPreset) => {
    const { name, ...r } = p;
    setRecipe({ ...r, colors: { ...(r.colors ?? {}) } });
    setStartedFrom(name);
    toast.show(`Started from ${name}`);
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
  const current = POSES.find((p) => p.value === pose) ?? POSES[0];

  return (
    <Screen contentStyle={styles.page}>
      <View style={styles.stage} testID="look-preview">
        <PetSprite species={pet.species} look={recipe} mood="calm" pose={current.pose(frame)} hat={asHat(pet.profile?.hat)} pixel={6} testID="look-sprite" />
      </View>
      <SegmentedControl options={POSES.map(({ value, label }) => ({ value, label }))} value={pose} onChange={setPose} testID="look-pose" />

      <Text style={styles.h2}>Start from a breed</Text>
      <TextField label="Search breeds" value={query} onChangeText={setQuery} soft testID="look-breed-search" />
      <View style={styles.breeds}>
        {shown.map((p) => (
          <Pressable
            key={p.name}
            accessibilityRole="button"
            accessibilityState={{ selected: startedFrom === p.name }}
            onPress={() => usePreset(p)}
            style={[styles.breed, startedFrom === p.name && styles.breedOn]}
            testID={`look-breed-${p.name}`}
          >
            <PetSprite species={pet.species} look={p} mood="calm" pixel={2} />
            <Text style={styles.breedName} numberOfLines={2}>{p.name}</Text>
          </Pressable>
        ))}
      </View>
      {!query && breeds.length > 12 ? (
        <TextButton label={allBreeds ? "Show fewer" : `Show all ${breeds.length} ${cat ? "cats" : "dogs"}`} onPress={() => setAllBreeds(!allBreeds)} style={styles.center} testID="look-breed-more" />
      ) : null}

      <Text style={styles.h2}>Change the looks</Text>
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

      <Button label="Save look" onPress={() => void save(recipe)} disabled={saving} testID="look-save" />
      <TextButton label="Use the breed look again" onPress={() => void save(null)} style={styles.center} testID="look-reset" />
    </Screen>
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
    page: { gap: theme.spacing.md },
    stage: { alignItems: "center", justifyContent: "center", paddingVertical: theme.spacing.sm, borderRadius: theme.radius.lg, backgroundColor: theme.color.surface },
    h2: { fontSize: theme.fontSize.section, fontWeight: theme.fontWeight.bold, color: theme.color.text, marginTop: theme.spacing.sm },
    breeds: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    breed: { width: 92, alignItems: "center", gap: 4, padding: theme.spacing.xs, borderRadius: theme.radius.md, borderWidth: 2, borderColor: "transparent", backgroundColor: theme.color.surface },
    breedOn: { borderColor: theme.color.primary },
    breedName: { fontSize: theme.fontSize.small, color: theme.color.text, textAlign: "center" },
    center: { alignSelf: "center" },
    group: { gap: theme.spacing.md },
    field: { gap: theme.spacing.xs },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    swatches: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: theme.color.border },
    swatchOn: { borderWidth: 3, borderColor: theme.color.primary },
  });
