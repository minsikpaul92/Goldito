import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { SitterAnswersForm } from "../components/SitterAnswersForm";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingView } from "../components/ui/LoadingView";
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from "../features/onboarding/localDraft";
import { loadDraft, saveDraft } from "../features/onboarding/onboardingApi";
import { OnboardingDraft, emptyDraft } from "../features/onboarding/questions";
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
  // The every-day hours as saved, to write them back only when the sitter changed them.
  const savedHours = useRef(emptyDraft().availability.hours);
  const userId = session.status === "signedIn" ? session.profile.id : null;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    Promise.all([loadDraft(userId), loadLocalDraft(userId)])
      .then(([d, local]) => {
        if (!active) return;
        savedHours.current = d.availability.hours;
        // Answers left halfway on this device win over the last saved ones (U2).
        setDraft(local ?? d);
      })
      .catch((e: Error) => active && setLoadError(e.message));
    return () => {
      active = false;
    };
  }, [userId]);

  // Every change is kept on this device until the answers are saved (U2: long flows keep a draft).
  useEffect(() => {
    if (userId && draft) void saveLocalDraft(userId, draft);
  }, [userId, draft]);

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
      await saveDraft(userId!, next, savedHours.current);
      await clearLocalDraft(userId!);
      toast.show("Saved");
      done();
    } catch (e) {
      toast.show((e as Error).message, { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SitterAnswersForm
        draft={draft}
        onChange={setDraft}
        onSkipAll={edit ? undefined : () => void save(emptyDraft())}
        onLeave={edit ? () => (router.canGoBack() ? router.back() : router.replace("/profile")) : undefined}
        onFinish={() => void save(draft)}
        saving={saving}
      />
    </>
  );
}
