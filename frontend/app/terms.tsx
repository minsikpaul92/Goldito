import { LegalPage, LegalSection } from "../components/LegalPage";

const UPDATED = "October 24, 2026";

const SECTIONS: LegalSection[] = [
  {
    title: "1. About this prototype",
    body: [
      "Goldito is a pet-care prototype developed for the Nebius x NVIDIA Global AI Hackathon. It is created for demonstration and judging purposes.",
      "Payments and bookings within this app use mock data. Please do not submit real payment details or confidential credentials.",
    ],
  },
  {
    title: "2. Pet care and responsibilities",
    body: [
      "Pet owners are responsible for providing accurate health, allergy, dietary, and behavioral notes for each pet.",
      "Sitters agree to review all pet care instructions and follow agreed-upon routines during bookings and transit.",
      "The Meet & Greet step is intended to ensure mutual comfort and pet compatibility before any care begins.",
    ],
  },
  {
    title: "3. AI suggestions and veterinary disclaimer",
    body: [
      "Goldito provides AI-assisted drafts for chat replies, daily reports, care plans, and treat checks using NVIDIA Nemotron and open-source models.",
      "AI outputs are helpful suggestions and do not constitute veterinary, medical, or professional behavioral advice.",
      "All AI-generated messages and daily reports require human review and approval before being sent, unless auto-send has been explicitly enabled.",
    ],
  },
  {
    title: "4. User content and photos",
    body: [
      "Users retain rights to the photos and updates they share in Goldito.",
      "By uploading photos, you confirm that you have the right to share them and that they do not infringe on the privacy or intellectual property of others.",
    ],
  },
  {
    title: "5. Service availability and changes",
    body: [
      "Because Goldito is an active hackathon demonstration, features and data may be modified, reset, or updated as development continues.",
      "For inquiries or bug reports, please refer to the project repository at github.com/minsikpaul92/Goldito.",
    ],
  },
];

/** Terms of Service (#375): reachable signed out from sign-up, and from Settings. */
export default function Terms() {
  return <LegalPage title="Terms of Service" updated={UPDATED} sections={SECTIONS} testID="terms" />;
}
