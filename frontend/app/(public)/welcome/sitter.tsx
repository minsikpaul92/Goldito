import { Redirect } from "expo-router";

/** The role tours became one How it works (intro trial); old links land there. */
export default function TourRedirect() {
  return <Redirect href="/welcome/how" />;
}
