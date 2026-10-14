import { ReactNode, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { useCaringPets } from "../care/useCaringPets";
import { listMyPets } from "../pets/petApi";

/** The pets a Snap tool may name (D61): the owner's own, or the ones in the sitter's care right now. */
export type Role = "owner" | "sitter";
export type PetOption = { id: string; name: string; species: "dog" | "cat" };
export type PetsState = { status: "loading" } | { status: "ready"; pets: PetOption[] } | { status: "error"; message: string };

/** Loads the role's pets — a sitter's bookings are read only for a sitter, an owner's pets only for an owner. */
export function SnapPets({ role, children }: { role: Role; children: (pets: PetsState) => ReactNode }) {
  return role === "owner" ? <OwnerPets>{children}</OwnerPets> : <SitterPets>{children}</SitterPets>;
}

function OwnerPets({ children }: { children: (pets: PetsState) => ReactNode }) {
  const session = useSession();
  const ownerId = session.status === "signedIn" ? session.profile.id : null;
  const [owned, setOwned] = useState<PetsState>({ status: "loading" });

  useEffect(() => {
    if (!ownerId) return;
    let live = true;
    listMyPets(ownerId)
      .then((list) => live && setOwned({ status: "ready", pets: list.map(({ id, name, species }) => ({ id, name, species })) }))
      .catch((error: Error) => live && setOwned({ status: "error", message: error.message }));
    return () => {
      live = false;
    };
  }, [ownerId]);

  return <>{children(owned)}</>;
}

function SitterPets({ children }: { children: (pets: PetsState) => ReactNode }) {
  const { state } = useCaringPets();
  const pets: PetsState =
    state.status === "ready" ? { status: "ready", pets: state.pets.map(({ id, name, species }) => ({ id, name, species })) } : state;
  return <>{children(pets)}</>;
}

/** One chip per pet; the selected one is highlighted. Tapping it again clears it when `optional`. */
export function PetChips({
  pets,
  selectedId,
  onSelect,
  disabled,
  optional,
  testIDPrefix,
}: {
  pets: PetOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
  optional?: boolean;
  testIDPrefix: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.pets}>
      {pets.map((p) => {
        const selected = p.id === selectedId;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            aria-selected={selected}
            disabled={disabled}
            onPress={() => onSelect(selected ? (optional ? null : p.id) : p.id)}
            style={[styles.pet, selected && styles.petSelected]}
            testID={`${testIDPrefix}-${p.id}`}
          >
            <Text style={styles.petLabel}>
              {p.species === "cat" ? "🐱" : "🐶"} {p.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    pets: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    pet: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    petSelected: { borderColor: theme.color.primary, backgroundColor: theme.color.accent },
    petLabel: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
