import { useEffect } from "react";

const MSG = "Há alterações não salvas. Deseja sair sem salvar?";

export function useUnsavedChangesGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = MSG;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const orig = window.history.pushState.bind(window.history);
    window.history.pushState = function (
      state: unknown,
      title: string,
      url?: string | null
    ) {
      const confirmed = window.confirm(MSG);
      if (confirmed) {
        window.history.pushState = orig;
        orig(state, title, url);
      }
    };

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.history.pushState = orig;
    };
  }, [isDirty]);
}
