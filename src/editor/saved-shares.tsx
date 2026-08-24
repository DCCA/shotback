import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes, shareLabel } from "@/editor/annotation-geometry";
import type { LocalShareMeta } from "@/lib/localStore";

interface SavedSharesProps {
  shares: LocalShareMeta[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SavedShares({ shares, onOpen, onDelete }: SavedSharesProps): JSX.Element {
  const [showSavedShares, setShowSavedShares] = useState(false);

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
        <p className="m-0 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          No saved shares yet. Use “Copy Local Share Link” to save one.
        </p>
      ) : showSavedShares ? (
        <ul className="m-0 grid list-none gap-2 p-0">
          {shares.map((share) => (
            <li key={share.id}>
              <div className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {shareLabel(share.pageUrl)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(share.createdAt).toLocaleString()} •{" "}
                    {formatBytes(share.imageByteSize)}
                  </div>
                </div>
                <div className="flex gap-1.5">
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
                    className="text-red-700 hover:bg-red-50"
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
      ) : null}
    </section>
  );
}
