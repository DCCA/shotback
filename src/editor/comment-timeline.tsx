import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { annotationSummary } from "@/lib/feedback";
import type { Annotation } from "@/types/annotation";

interface CommentTimelineProps {
  items: Annotation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

export function CommentTimeline({
  items,
  selectedId,
  onSelect,
  onRemove
}: CommentTimelineProps): JSX.Element {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-sm font-semibold">Comment Timeline</h2>
        <Badge>{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="m-0 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
          No comments yet.
        </p>
      ) : (
        <ol className="m-0 grid list-none gap-2 p-0">
          {items.map((item, index) => {
            const selected = item.id === selectedId;
            return (
              <li key={item.id}>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      selected
                        ? "border-primary bg-accent ring-2 ring-ring/40"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                    onClick={() => onSelect(item.id)}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      #{index + 1} {item.tool} • {new Date(item.createdAt).toLocaleTimeString()}
                    </div>
                    <div className="mt-1 text-sm text-foreground">{annotationSummary(item)}</div>
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="self-start text-destructive hover:bg-destructive/10"
                    aria-label={`Delete timeline item ${index + 1}`}
                    onClick={() => onRemove(item.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
