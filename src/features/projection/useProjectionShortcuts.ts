import * as React from "react";
import { isStageRoute } from "../stage/stage-window";
import { useProjection } from "./store";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useProjectionShortcuts(): void {
  const { canPrev, canNext, canProject, selectPrev, selectNext, projectSelected, clear } = useProjection();

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || isTyping(e.target) || isStageRoute()) return;

      switch (e.key) {
        case "ArrowLeft":
        case "PageUp": {
          if (!canPrev) return;
          e.preventDefault();
          selectPrev();
          window.dispatchEvent(new CustomEvent("proge:shortcut", { detail: "prev" }));
          break;
        }
        case "ArrowRight":
        case "PageDown":
        case " ": {
          if (!canNext) return;
          e.preventDefault();
          selectNext();
          window.dispatchEvent(new CustomEvent("proge:shortcut", { detail: "next" }));
          break;
        }
        case "Enter": {
          if (!canProject || e.repeat) return;
          e.preventDefault();
          void projectSelected();
          window.dispatchEvent(new CustomEvent("proge:shortcut", { detail: "project" }));
          break;
        }
        case "Escape": {
          e.preventDefault();
          void clear();
          window.dispatchEvent(new CustomEvent("proge:shortcut", { detail: "clear" }));
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canPrev, canNext, canProject, selectPrev, selectNext, projectSelected, clear]);
}
