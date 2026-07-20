import { useEffect, useRef } from "react";

const MSG = "Você tem alterações não salvas. Deseja sair sem salvar?";

export function useUnsavedChangesGuard(isDirty: boolean): { clear: () => void } {
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = MSG;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    const orig = window.history.pushState.bind(window.history);
    window.history.pushState = function (
      state: unknown,
      title: string,
      url?: string | null,
    ) {
      if (!isDirtyRef.current) {
        orig(state, title, url);
        return;
      }
      const confirmed = window.confirm(MSG);
      if (confirmed) {
        isDirtyRef.current = false;
        orig(state, title, url);
      }
    };

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.history.pushState = orig;
    };
  }, []);

  return {
    clear: () => {
      isDirtyRef.current = false;
    },
  };
}
