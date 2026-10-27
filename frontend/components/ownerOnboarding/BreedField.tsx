import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { BigInput } from "./BigInput";
import { Icon } from "../ui/Icon";
import { matchBreeds } from "../../features/ownerOnboarding/breeds";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Species } from "../../types/db";

type Props = {
  species: Species;
  value: string;
  onChange: (breed: string) => void;
  onSubmit: () => void;
  testID: string;
};

/** The breed box with a list of the reviewed breeds under it: typing searches the list, and any other breed can be typed. */
export function BreedField({ species, value, onChange, onSubmit, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const matches = matchBreeds(species, value);
  // A breed picked from the list closes it; typing opens it again.
  const exact = matches.some((breed) => breed.toLowerCase() === value.trim().toLowerCase());
  const showList = open && !exact && matches.length > 0;

  return (
    <View style={styles.wrap}>
      <View>
        <BigInput
          value={value}
          onChangeText={(breed) => {
            onChange(breed);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onSubmitEditing={onSubmit}
          returnKeyType="next"
          placeholder="Search or type"
          accessibilityLabel="Breed"
          testID={testID}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showList ? "Hide breeds" : "Show breeds"}
          onPress={() => setOpen((on) => !on)}
          style={styles.toggle}
          testID={`${testID}-toggle`}
        >
          <View style={showList ? styles.flipped : null}>
            <Icon name="expand" size={22} color={theme.color.text} />
          </View>
        </Pressable>
      </View>
      {showList ? (
        <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled" testID={`${testID}-list`}>
          {matches.map((breed) => (
            <Pressable
              key={breed}
              accessibilityRole="button"
              onPress={() => {
                onChange(breed);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              testID={`${testID}-option-${breed.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <Text style={styles.rowText}>{breed}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.spacing.xs },
    toggle: {
      position: "absolute",
      right: 4,
      top: 0,
      bottom: 0,
      width: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    flipped: { transform: [{ rotate: "180deg" }] },
    list: {
      maxHeight: 240,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      borderRadius: theme.ui.radius.card,
      backgroundColor: theme.color.surface,
    },
    row: { minHeight: 48, justifyContent: "center", paddingHorizontal: theme.spacing.md },
    pressed: { backgroundColor: theme.color.background },
    rowText: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
