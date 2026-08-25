import { Button } from "@/components/ui/button";
import { annotationSummary, describeElement } from "@/lib/feedback";
import { numberAnnotations } from "@/lib/numbering";
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
  // The one numbering, shared with the pins, the prompt and the export - it
  // drops redactions (no note to number) and orders by creation, so nothing
  // upstream has to filter or sort before handing over its annotations.
  const rows = numberAnnotations(items);

  return (
    <section className="space-y-2">
      {/* No count badge: the sidebar header states the annotation count once,
          and two badges saying the same number is one more thing that can end
          up disagreeing. The list below is its own answer to "how many". */}
      <h2 className="m-0 text-sm font-semibold">Comment Timeline</h2>
      {rows.length === 0 ? (
        <p className="m-0 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
          No comments yet.
        </p>
      ) : (
        <ol className="m-0 grid list-none gap-2 p-0">
          {rows.map(({ n, annotation: item }) => {
            const selected = item.id === selectedId;
            return (
              <li key={item.id}>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    // `min-w-0`: the row is a `1fr auto` grid, and a grid item
                    // defaults to an automatic minimum - without this the
                    // element line below refuses to shrink and pushes Remove
                    // off the sidebar instead of truncating.
                    className={`min-w-0 rounded-lg border px-3 py-2 text-left transition ${
                      selected
                        ? "border-primary bg-accent ring-2 ring-ring/40"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                    onClick={() => onSelect(item.id)}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      #{n} {item.tool} • {new Date(item.createdAt).toLocaleTimeString()}
                    </div>
                    <div className="mt-1 text-sm text-foreground">{annotationSummary(item)}</div>
                    {/* What this annotation actually landed on, as soon as the
                        inspection round trip answers - the same element the
                        prompt will name. `elementsFromPoint` always resolves
                        something, so a box a few px off its target still gets
                        a confident selector; showing it here is what lets that
                        be caught before the export rather than after it. Full
                        path on hover, one truncated line in the row. */}
                    {item.context ? (
                      <div
                        className="mt-0.5 truncate text-[11px] text-muted-foreground"
                        title={item.context.cssPath}
                      >
                        {describeElement(item.context)}
                      </div>
                    ) : null}
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="self-start text-destructive hover:bg-destructive/10"
                    aria-label={`Delete timeline item ${n}`}
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
