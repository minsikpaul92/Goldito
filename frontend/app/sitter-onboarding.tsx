import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { SitterAnswersForm } from "../components/SitterAnswersForm";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingView } from "../components/ui/LoadingView";
import { Screen } from "../components/ui/Screen";
import { loadDraft, saveDraft } from "../features/onboarding/onboardingApi";
import { EMPTY_DRAFT, OnboardingDraft } from "../features/onboarding/questions";
import { useSession } from "../providers/SessionProvider";
import { useToast } from "../providers/ToastProvider";

/**
 * Sitter onboarding (3D.2, #139). Shown once to a new sitter (the sitter area sends them here until they finish), and
 * reachable later from Profile to edit the same answers (`?edit=1`).
 */
export default function SitterOnboarding() {
  const edit = useLocalSearchParams<{ edit?: string }>().edit === "1";
  const session = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const userId = session.status === "signedIn" ? session.profile.id : null;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    loadDraft(userId)
      .then((d) => active && setDraft(d))
      .catch((e: Error) => active && setLoadError(e.message));
    return () => {
      active = false;
    };
  }, [userId]);

  if (session.status === "loading") return <LoadingView />;
  if (session.status !== "signedIn" || session.profile.role !== "sitter") return <Redirect href="/" />;
  if (loadError) return <EmptyState emoji="🐾" title="Couldn't load your answers" message={loadError} />;
  if (!draft) return <LoadingView />;

  const done = () => {
    if (edit && router.canGoBack()) router.back();
    else router.replace("/sitter");
  };

  const save = async (next: OnboardingDraft) => {
    setSaving(true);
    try {
      await saveDraft(next);
      toast.show("Saved");
      done();
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen testID="sitter-onboarding">
      <SitterAnswersForm
        draft={draft}
        onChange={setDraft}
        onSkipAll={edit ? undefined : () => void save(EMPTY_DRAFT)}
        onFinish={() => void save(draft)}
        saving={saving}
      />
    </Screen>
  );
}
