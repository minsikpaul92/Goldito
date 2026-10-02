import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

// Stub tab (phase-03b 3B.0): the booking list and Book care land in 3B.3.
export default function OwnerBookings() {
  return (
    <Screen>
      <EmptyState
        emoji="📅"
        title="No bookings yet"
        message="Book a sitter for your next trip — your requests and stays will show here."
      />
    </Screen>
  );
}
