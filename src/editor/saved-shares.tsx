import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes, shareLabel } from "@/editor/annotation-geometry";
import { useTimedConfirm } from "@/editor/use-confirm";
import { getLocalShareImageUrl, type LocalShareMeta } from "@/lib/localStore";

/** How long an armed Delete waits for its confirming click before reverting. */
const DELETE_CONFIRM_MS = 3000;

/** What a row is called: the page's own title, or its hostname when none was recorded. */
function shareTitle(share: LocalShareMeta): string {
  return share.environment?.pageTitle.trim() || shareLabel(share.pageUrl);
}

interface SavedSharesProps {
  shares: LocalShareMeta[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** Re-opens the share's page and starts a fresh capture linked back to it. */
  onRecapture: (share: LocalShareMeta) => void;
  /** Hands the ticked shares, newest first, to the batch Claude Code export. */
  onBatchExport: (ids: string[]) => void;
  /** Same guard the sidebar's actions use: no second export while one runs. */
  isBusy: boolean;
}

export function SavedShares({
  shares,
  onOpen,
  onDelete,
  onRecapture,
  onBatchExport,
  isBusy
}: SavedSharesProps): JSX.Element {
  const [showSavedShares, setShowSavedShares] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const remove = useTimedConfirm<string>(DELETE_CONFIRM_MS);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  // The same map, readable synchronously: the effect below has to know what is
  // already loaded without listing state as a dependency of its own loader.
  const loaded = useRef<Record<string, string>>({});

  /**
   * Thumbnails are object URLs over the stored blobs, loaded on demand - a
   * share's PNG is a full-page capture, so reading every one up front would
   * cost far more than the 40px they are shown at.
   *
   * Diffed rather than rebuilt. `shares` is a fresh array after every refresh
   * (a delete, a new share), and tearing the map down on identity change made
   * a single delete blank every row to grey and re-read every blob from
   * IndexedDB. So: revoke only the ids that left, load only the ids that are
   * missing.
   *
   * ponytail: closing the list keeps what it loaded, so reopening is instant
   * rather than a second pass of blank rows. Bounded by the retention cap
   * (50 shares) and released on unmount below; if that ever matters, revoke on
   * close and accept the reload.
   */
  useEffect(() => {
    const wanted = new Set(shares.map((share) => share.id));
    const kept: Record<string, string> = {};
    for (const [id, url] of Object.entries(loaded.current)) {
      if (wanted.has(id)) kept[id] = url;
      else URL.revokeObjectURL(url);
    }
    loaded.current = kept;
    // Deliberately no `setThumbnails` here: a departed share is not rendered,
    // so its stale entry is invisible and goes on the next load's spread.
    // Publishing it synchronously would only cascade a render per refresh.
    if (!showSavedShares) return;

    let live = true;
    void (async () => {
      for (const share of shares) {
        if (loaded.current[share.id]) continue;
        let url: string | null = null;
        try {
          url = await getLocalShareImageUrl(share);
        } catch {
          // A missing or unreadable blob just leaves the row without a preview.
        }
        if (!url) continue;
        if (!live) {
          URL.revokeObjectURL(url);
          return;
        }
        loaded.current = { ...loaded.current, [share.id]: url };
        setThumbnails(loaded.current);
      }
    })();

    return () => {
      live = false;
    };
  }, [shares, showSavedShares]);

  // The editor tab outlives the list, so what it still holds is released here.
  useEffect(
    () => () => {
      Object.values(loaded.current).forEach((url) => URL.revokeObjectURL(url));
      loaded.current = {};
    },
    []
  );

  // Derived from the live list, not from the Set alone, so a share deleted
  // while ticked cannot linger in the batch.
  const selectedIds = shares.filter((share) => selected.has(share.id)).map((share) => share.id);

  const toggle = (id: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-sm font-semibold">Saved Shares</h2>
        <div className="flex items-center gap-2">
          {/* `id` is a test hook, in the style of `#capture-window`'s
              `data-crop`: how many shares are stored is what the e2e checks
              after an export claims to have saved one. */}
          <Badge id="saved-share-count">{shares.length}</Badge>
          {shares.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowSavedShares((value) => !value)}
            >
              {showSavedShares ? "Hide" : "Show"}
            </Button>
          ) : null}
        </div>
      </div>
      {shares.length === 0 ? (
        <p className="m-0 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
          No saved shares yet. Use “Copy Local Share Link” to save one.
        </p>
      ) : showSavedShares ? (
        <>
          <ul className="m-0 grid list-none gap-2 p-0">
            {shares.map((share) => {
              const title = shareTitle(share);
              const armed = remove.armed === share.id;
              return (
                <li key={share.id}>
                  <div className="grid grid-cols-[auto_auto_1fr] items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
                    {/* The label extends the checkbox's clickable/tappable area
                      to a 24x24 target (WCAG 2.5.8) without growing the
                      visible tick itself. */}
                    <label className="mt-1 flex size-6 shrink-0 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={selected.has(share.id)}
                        aria-label={`Select saved share for ${title}`}
                        onChange={() => toggle(share.id)}
                      />
                    </label>
                    {thumbnails[share.id] ? (
                      <img
                        src={thumbnails[share.id]}
                        alt=""
                        loading="lazy"
                        // Top-anchored: a full-page capture is far taller than
                        // it is wide, so the head of the page is the part worth
                        // showing in a 40px square.
                        className="size-10 shrink-0 rounded border border-border object-cover object-top"
                      />
                    ) : (
                      <div className="size-10 shrink-0 rounded border border-border bg-muted" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground" title={title}>
                        {title}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(share.createdAt).toLocaleString()} •{" "}
                        {formatBytes(share.imageByteSize)}
                      </div>
                    </div>
                    <div className="col-start-2 col-end-4 flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onOpen(share.id)}
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        aria-label={`Re-capture ${title}`}
                        onClick={() => onRecapture(share)}
                      >
                        Re-capture
                      </Button>
                      {/* Two steps, in place: the first click arms this one row
                          and the second deletes. It reverts by itself, so a
                          prompt left armed cannot be hit by a later click. */}
                      {armed ? (
                        // Escape cancels and the trigger takes focus back when
                        // this goes, timed revert included - see
                        // `useTimedConfirm`.
                        <span className="contents" onKeyDown={remove.onKeyDown}>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            autoFocus
                            aria-label={`Confirm deleting saved share for ${title}`}
                            onClick={remove.onConfirm(() => onDelete(share.id))}
                          >
                            Confirm
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => remove.arm(null)}
                          >
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button
                          type="button"
                          ref={remove.triggerRef(share.id)}
                          variant="secondary"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          aria-label={`Delete saved share for ${title}`}
                          onClick={() => remove.arm(share.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {selectedIds.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={isBusy}
              onClick={() => onBatchExport(selectedIds)}
            >
              Copy batch for Claude Code ({selectedIds.length})
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
