import { EmptyState } from "../../../components/ui/EmptyState";
import { Screen } from "../../../components/ui/Screen";

// Stub tab (phase-03b 3B.0): requests, upcoming and past stays land in 3B.4.
export default function SitterBookings() {
  return (
    <Screen>
      <EmptyState
        emoji="📬"
        title="No requests yet"
        message="Booking requests from owners will show here for you to accept."
      />
    </Screen>
  );
}
