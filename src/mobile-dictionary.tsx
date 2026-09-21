import { useLayoutEffect, useRef } from "react";
import type { DictionarySelection } from "./dictionary-entry";
import { DictionaryView } from "./dictionary-view";

export const MOBILE_DICTIONARY_QUERY = "(max-width: 639px)";

interface MobileDictionaryProps {
  selection: DictionarySelection;
  onSelect: (id: string) => void;
  onClose: () => void;
  returnFocus: SVGGElement | null;
}

export function MobileDictionary({ selection, onSelect, onClose, returnFocus }: MobileDictionaryProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    const media = window.matchMedia(MOBILE_DICTIONARY_QUERY);

    if (!media.matches) {
      onClose();
      return;
    }

    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        onClose();
      }
    };

    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("[data-dictionary-close]")?.focus({ preventScroll: true });
    media.addEventListener("change", handleViewportChange);

    return () => {
      media.removeEventListener("change", handleViewportChange);
      dialog.close();

      if (returnFocus?.isConnected) {
        returnFocus.focus({ preventScroll: true });
      }
    };
  }, [onClose, returnFocus]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Word and grammar lookup"
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-white p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-aizome"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <DictionaryView
        entries={selection.entries}
        selectedId={selection.selectedId}
        onSelect={onSelect}
        onClose={onClose}
      />
    </dialog>
  );
}
