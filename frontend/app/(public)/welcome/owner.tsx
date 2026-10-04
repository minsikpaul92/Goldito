import { OnboardingTour, type TourStep } from "../../../components/OnboardingTour";

const STEPS: TourStep[] = [
  {
    title: "Care updates that feel like they already know you",
    body: "Stop pinging your sitter for “how’s Max?” Photos, meds, and the daily note arrive in your feed — like they understood what you care about without you asking.",
    media: {
      kind: "image",
      title: "Owner home — next booking + pets",
      brief:
        "Still of Chloe’s Home: Max & Mochi cards, “Next: Lucy · Thanksgiving stay,” warm Kidsnote-style layout. No real address or faces.",
    },
  },
  {
    title: "Follow the stay as it happens",
    body: "Walks, meals, naps, and meds show up on a timeline. Open the album by day when you want the full picture — no DM scroll.",
    media: {
      kind: "video",
      title: "Feed & album walkthrough (8–12 s)",
      brief:
        "Screen recording: new care post → Album (Meals · Walks · Naps). Soft UI sounds OK; no voiceover for P0.",
    },
  },
  {
    title: "Book, sign, and breathe easy",
    body: "Ask about dates, get a quote, Meet & Greet, then checkout with clear consents. Entry codes unlock for your sitter only when it’s time.",
    media: {
      kind: "image",
      title: "Checkout + entry-info lock card",
      brief:
        "Still: QuoteCard · consents · Pay (demo); locked “Entry info unlocks 2 h before” on the sitter side.",
    },
  },
];

/** Owner-only onboarding tour → existing `/login`. */
export default function OwnerOnboarding() {
  return <OnboardingTour role="owner" steps={STEPS} testID="onboarding-owner" />;
}
