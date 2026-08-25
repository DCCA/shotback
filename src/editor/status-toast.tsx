import { useEffect, useState } from "react";
import type { EditorState } from "@/editor/use-editor-state";

/** How long a success message stays up before it clears itself. */
const SUCCESS_DISMISS_MS = 4000;

/**
 * Icons are inline paths in the surrounding stroke style rather than glyphs:
 * an emoji would carry the platform's own colour and shape into a themed
 * surface, and would not inherit `currentColor` from the toast's tone.
 */
function Icon({ path }: { path: JSX.Element }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-px size-4 shrink-0"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

interface ToastProps {
  tone: "progress" | "success" | "error";
  message: string;
  /** Rendered only when the message persists until it is dismissed. */
  onDismiss?: () => void;
}

function Toast({ tone, message, onDismiss }: ToastProps): JSX.Element {
  // Mounted hidden and shifted, then flipped on the next frame so the browser
  // has a start value to transition from. Remounted per message by the `key`
  // the parent sets, so a second message animates in like the first.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`pointer-events-auto flex max-w-full items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-sm shadow-[0_10px_28px_-8px_hsl(var(--card-shadow)),0_2px_6px_-2px_hsl(var(--card-shadow))] transition-[transform,opacity] duration-200 ease-swift ${
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${tone === "error" ? "border-destructive" : "border-border"}`}
    >
      {tone === "success" ? (
        <span className="text-primary">
          <Icon path={<path d="m20 6-11 11-5-5" />} />
        </span>
      ) : null}
      {tone === "error" ? (
        <span className="text-destructive">
          <Icon
            path={
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5" />
                <path d="M12 16.5h.01" />
              </>
            }
          />
        </span>
      ) : null}

      {/* `font-medium` marks the status line apart from the progress line for
          assistive tech and for the e2e, which waits on exactly this node. */}
      <p
        className={`m-0 ${
          tone === "progress"
            ? "text-muted-foreground"
            : `font-medium ${tone === "success" ? "text-primary" : "text-destructive"}`
        }`}
      >
        {message}
      </p>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="-mr-1 -mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <Icon
            path={
              <>
                <path d="m6 6 12 12" />
                <path d="m18 6-12 12" />
              </>
            }
          />
        </button>
      ) : null}
    </div>
  );
}

interface StatusToastProps {
  status: EditorState["status"];
  setStatus: EditorState["setStatus"];
  progress: string;
}

/**
 * The editor's one aria-live region, floated over the canvas instead of buried
 * in the sidebar's scroll flow - the outcome of a button press has to be
 * visible from wherever the eye already is, which is the capture.
 *
 * A success clears itself after `SUCCESS_DISMISS_MS`; an error stays until it
 * is dismissed, because "the copy failed" is not something to blink past.
 * Progress rides alongside and is cleared by whatever set it.
 */
export function StatusToast({ status, setStatus, progress }: StatusToastProps): JSX.Element {
  useEffect(() => {
    if (status?.kind !== "success") return;
    const timer = window.setTimeout(() => setStatus(null), SUCCESS_DISMISS_MS);
    return () => window.clearTimeout(timer);
    // Keyed on the status OBJECT, not on its kind and message. Every
    // `setStatus` call builds a fresh object, so an identical message arriving
    // a second time is still a new identity: the effect re-runs, the previous
    // timer is cleared and the new toast gets its own full 4s. Keying on the
    // text would have let the second toast inherit the first one's remaining
    // time and vanish almost at once. `setStatus` is `useState`'s setter, so
    // it is stable and cannot restart the clock on an unrelated render.
  }, [status, setStatus]);

  return (
    <div
      aria-live="polite"
      // `absolute` from `lg` up, where the canvas pane is always on screen and
      // the toast belongs over it. Below that the shell unwinds and the window
      // scrolls, so the canvas card can be scrolled away by the time an export
      // button is pressed - `fixed` keeps the answer on screen there, which is
      // the whole reason this stopped living in the sidebar.
      //
      // Bottom-right, not top-right: the tool palette is docked along the top
      // of this same card, so a toast up there covered the colour swatches and
      // the Zoom select - and, being `pointer-events-auto`, swallowed clicks
      // aimed at them for the full 4s a success is up. The bottom-left corner
      // is taken by the applied-crop chip, so the toast takes the other one.
      className="pointer-events-none fixed bottom-4 right-4 z-20 flex w-[min(22rem,calc(100%-2rem))] flex-col items-end gap-2 lg:absolute"
    >
      {/* A stable key: progress counts up step by step, and re-animating the
          same toast on every frame of it would read as a flicker. */}
      {progress ? <Toast key="progress" tone="progress" message={progress} /> : null}
      {status ? (
        <Toast
          key={`${status.kind}:${status.message}`}
          tone={status.kind}
          message={status.message}
          onDismiss={status.kind === "error" ? () => setStatus(null) : undefined}
        />
      ) : null}
    </div>
  );
}
