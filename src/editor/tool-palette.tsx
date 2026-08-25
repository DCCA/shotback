import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { EditorState } from "@/editor/use-editor-state";
import { activeSegment, isCustomColor, SWATCHES, TOOL_SEGMENTS } from "@/lib/tool-palette";
import { cn } from "@/lib/utils";

/**
 * The custom swatch's fill: a colour wheel, so the disc reads as "any colour"
 * rather than as a seventh preset. Purely decorative (the disc is
 * `aria-hidden`, the native input behind it carries the label), and an inline
 * style because it is a gradient of raw hues, not a themeable token.
 */
const COLOR_WHEEL =
  "conic-gradient(#ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)";

interface ToolPaletteProps {
  state: EditorState;
}

/**
 * The canvas toolbar: tool segments, stroke swatches and zoom, docked above
 * the capture inside the canvas card. It sits here rather than in the sidebar
 * because every control on it changes what the *next* pointer gesture does -
 * they belong where the pointer is.
 */
export function ToolPalette({ state }: ToolPaletteProps): JSX.Element {
  const { tool, interactionMode, setPaletteTool, color, setColor, zoom, setZoom } = state;

  const active = activeSegment(tool, interactionMode);
  const custom = isCustomColor(color);

  return (
    // `h-12 shrink-0`: the bar keeps its height while the scrollport below
    // takes the card's leftover space. `overflow-x-auto` rather than wrapping,
    // so a narrow pane scrolls the toolbar instead of doubling its height and
    // shoving the capture down.
    <div
      data-tool-palette
      className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-3"
    >
      {/* One bordered group with hairlines between the segments - a real
          segmented control, not six floating pills. `overflow-hidden` is what
          lets the filled active segment take the group's rounded corners. */}
      <div
        role="group"
        aria-label="Tool"
        className="flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-input"
      >
        {TOOL_SEGMENTS.map((segment, index) => {
          const isActive = segment.value === active;
          return (
            <button
              key={segment.value}
              type="button"
              aria-label={segment.label}
              aria-pressed={isActive}
              onClick={() => setPaletteTool(segment.value)}
              className={cn(
                "flex h-8 items-center gap-1.5 px-2.5 text-[13px] font-semibold transition-colors duration-200 ease-swift focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                index > 0 && "border-l border-input",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-secondary-foreground hover:bg-secondary-hover"
              )}
            >
              {segment.label}
              <kbd
                className={cn(
                  "font-sans text-[10px] font-bold leading-none",
                  isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                )}
              >
                {segment.hotkey}
              </kbd>
            </button>
          );
        })}
      </div>

      <Separator orientation="vertical" className="h-6 shrink-0" />

      <div role="group" aria-label="Annotation color" className="flex shrink-0 items-center gap-2">
        {SWATCHES.map((swatch) => {
          const isActive = !custom && swatch.value.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={swatch.value}
              type="button"
              aria-label={`${swatch.label} annotation color`}
              aria-pressed={isActive}
              onClick={() => setColor(swatch.value)}
              // The disc's own colour is the annotation's colour: data, so it
              // is an inline style and not a Tailwind class.
              style={{ backgroundColor: swatch.value }}
              className={cn(
                // The inset hairline is what keeps a near-black swatch from
                // vanishing into the dark card (and a pale one out of the
                // light one) - it outlines the disc in whatever the theme's
                // ink is, at a quarter strength.
                "size-6 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.25)] ring-offset-2 ring-offset-card transition-shadow duration-200 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive && "ring-2 ring-ring"
              )}
            />
          );
        })}

        {/* The native colour input is the picker; it lies transparent over the
            wheel disc so the control looks like the six beside it while the
            browser still owns the dialog and the keyboard behaviour. */}
        <div className="relative size-6 shrink-0">
          <input
            type="color"
            aria-label="Custom annotation color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="peer absolute inset-0 size-full cursor-pointer opacity-0"
          />
          <span
            aria-hidden="true"
            style={{ background: COLOR_WHEEL }}
            className={cn(
              "pointer-events-none block size-6 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.25)] ring-offset-2 ring-offset-card",
              custom && "ring-2 ring-ring",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
            )}
          />
        </div>
      </div>

      <Separator orientation="vertical" className="h-6 shrink-0" />

      {/* The wrapper carries `shrink-0`: `Select`'s own class lands on its
          button, not on the positioned root the listbox is anchored to. */}
      <div className="w-40 shrink-0">
        <Select
          aria-label="Zoom"
          value={zoom}
          onValueChange={(value) => setZoom(value as "fit" | "actual")}
          options={[
            { value: "fit", label: "Fit width" },
            { value: "actual", label: "Actual size (100%)" }
          ]}
          className="h-8 py-1 text-[13px]"
        />
      </div>
    </div>
  );
}
