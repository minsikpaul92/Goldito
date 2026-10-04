import { OnboardingTour, type TourStep } from "../../../components/OnboardingTour";

const STEPS: TourStep[] = [
  {
    title: "Focus on the pets — we handle the paperwork",
    body: "Care needs, allergies, reports, and bookings live in the app. Spend your energy on the animals, not typing the same update five times.",
    media: {
      kind: "image",
      title: "Sitter Today — pets in care",
      brief:
        "Still of Lucy’s Today: Max & Mochi “Now caring,” Heads-up allergy chip (chicken), today’s drop-off/pick-up row. No real phone numbers.",
    },
  },
  {
    title: "Checklists and five-second updates",
    body: "Owner care requests become a checklist. Complete with a photo, pick AI chips for the daily note, add a short optional note — near-zero typing.",
    media: {
      kind: "video",
      title: "Task → photo → report chips (10–15 s)",
      brief:
        "Screen recording: Complete with photo → sample tray → chips on/off → Send. Optional short note once.",
    },
  },
  {
    title: "Bookings and entry info when you need them",
    body: "Accept requests, agree times, and unlock home entry codes only in the 2-hour window before you arrive. Codes never sit in chat.",
    media: {
      kind: "image",
      title: "Booking detail + Show code",
      brief:
        "Still: EntryInfoCard locked, then Show code (blur digits in the final asset).",
    },
  },
];

/** Sitter-only onboarding tour → existing `/login`. */
export default function SitterOnboarding() {
  return <OnboardingTour role="sitter" steps={STEPS} testID="onboarding-sitter" />;
}
