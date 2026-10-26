import { Image, StyleSheet, View } from "react-native";

import { Art } from "../art/Art";
import { Role } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

const MAX_PHOTO = require("../../assets/demo/mumu/mumu_white_table.jpg");
const MAX = require("../../assets/welcome/max.png");
const MOCHI = require("../../assets/welcome/mochi.png");

/**
 * What each side of Goldito gets, as one small picture (demo sheet, Log in demo tiles): the owner's home with a
 * photo of Max arriving; the sitter with Max and Mochi in their care and the camera they share with.
 */
export function RoleArt({ role, size = 64 }: { role: Role; size?: number }) {
  const styles = useThemedStyles(makeStyles);
  const s = size / 64;
  if (role === "owner") {
    return (
      <View style={{ width: size, height: size }} aria-hidden>
        <View style={{ position: "absolute", left: 0, bottom: 0 }}>
          <Art name="bookings/house" size={50 * s} />
        </View>
        <Image
          source={MAX_PHOTO}
          style={[styles.photo, { width: 34 * s, height: 34 * s, borderRadius: 17 * s, borderWidth: 2.5 * s, right: 0, top: 0 }]}
        />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size }} aria-hidden>
      <Image source={MAX} style={{ position: "absolute", left: 0, bottom: 2 * s, width: 40 * s, height: 56 * s }} resizeMode="contain" />
      <Image source={MOCHI} style={{ position: "absolute", right: -4 * s, bottom: 0, width: 46 * s, height: 26 * s }} resizeMode="contain" />
      <View style={{ position: "absolute", right: 0, top: 4 * s }}>
        <Art name="sitter/five-second" size={24 * s} />
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    photo: { position: "absolute", borderColor: theme.color.surface },
  });
