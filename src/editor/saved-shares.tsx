import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes, shareLabel } from "@/editor/annotation-geometry";
import type { LocalShareMeta } from "@/lib/localStore";

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
          <Badge>{shares.length}</Badge>
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
            {shares.map((share) => (
              <li key={share.id}>
                <div className="grid grid-cols-[auto_1fr] items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  {/* The label extends the checkbox's clickable/tappable area
                      to a 24x24 target (WCAG 2.5.8) without growing the
                      visible tick itself. */}
                  <label className="mt-1 flex size-6 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selected.has(share.id)}
                      aria-label={`Select saved share for ${shareLabel(share.pageUrl)}`}
                      onChange={() => toggle(share.id)}
                    />
                  </label>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {shareLabel(share.pageUrl)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(share.createdAt).toLocaleString()} •{" "}
                      {formatBytes(share.imageByteSize)}
                    </div>
                  </div>
                  <div className="col-start-2 flex flex-wrap gap-1.5">
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
                      aria-label={`Re-capture ${shareLabel(share.pageUrl)}`}
                      onClick={() => onRecapture(share)}
                    >
                      Re-capture
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      aria-label={`Delete saved share for ${shareLabel(share.pageUrl)}`}
                      onClick={() => onDelete(share.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
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
