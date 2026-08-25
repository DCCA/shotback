import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { EditorState } from "@/editor/use-editor-state";
import { activeSegment, isCustomColor, SWATCHES, TOOL_SEGMENTS } from "@/lib/tool-palette";
import { cn } from "@/lib/utils";

/**
 * The custom swatch's fill: a colour wheel, so the disc reads as "any colour"
 * rather than as a seventh preset. Built from `SWATCHES` (wrapping back to the
 * first so the gradient closes) rather than re-typing the hexes, so the wheel
 * cannot drift from the presets beside it. Purely decorative - the disc is
 * `aria-hidden` and the native input behind it carries the label - and an
 * inline style because it is raw hues, not a themeable token.
 */
const COLOR_WHEEL = `conic-gradient(${[...SWATCHES, SWATCHES[0]]
  .map((swatch) => swatch.value)
  .join(", ")})`;

/**
 * One swatch disc. The inset hairline outlines it in the theme's own ink, so a
 * pale disc reads against the light card; the `DISC_CORE` below is what does
 * the same job for a near-black one on the dark card, where the rim alone left
 * `#111827` looking like an empty slot.
 */
const DISC =
  "grid size-6 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.3)] ring-offset-2 ring-offset-card transition-shadow duration-200 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * A 6px dot in the theme's own ink at low alpha. Because `--foreground` is by
 * definition the opposite end of the theme from `--card`, the dot is faint on
 * a mid-tone swatch and unmistakable on the one disc whose fill sits close to
 * the card - which is exactly where "filled" has to be told apart from
 * "empty" (`#111827` on the dark card). Decorative, never a hit target.
 */
const DISC_CORE = "pointer-events-none size-1.5 rounded-full bg-foreground/40";

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
  const {
    tool,
    interactionMode,
    setPaletteTool,
    color,
    setColor,
    zoom,
    setZoom,
    baseDataUrl,
    isBusy
  } = state;

  // Nothing to draw on yet: the tools and swatches would be inert, so they
  // say so. `isBusy` says the same thing for the other reason: an export
  // snapshots the annotations synchronously and then awaits the render, so
  // anything drawn while one is in flight - a redaction above all - would be
  // accepted on screen and absent from every file that run produces. Zoom
  // stays live in both states: it is a property of the view, not of a
  // gesture. The canvas keymap and the pointer handlers carry the same guard,
  // so neither the hotkeys nor the mouse are a way around this.
  const disabled = !baseDataUrl || isBusy;

  const active = activeSegment(tool, interactionMode);
  const custom = isCustomColor(color);

  return (
    // `shrink-0`: the bar keeps its height while the scrollport below takes the
    // card's leftover space. It wraps into as many rows as it needs at **every**
    // width - a segment hidden off the right edge is worse than a second row,
    // and eight segments plus the swatches and Zoom no longer fit one row on a
    // narrow canvas pane even above `lg`. Wrapping rather than overflowing is
    // also what keeps the pane from being widened by its own toolbar.
    <div
      data-tool-palette
      className="flex h-auto min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-1.5"
    >
      {/* One bordered group with hairlines between the segments - a real
          segmented control, not eight floating pills. `overflow-hidden` is what
          lets the filled active segment take the group's rounded corners.
          It wraps internally rather than holding a fixed width: eight segments
          are wider than the canvas pane on a narrow window, and a group that
          refuses to shrink widens the pane and clips the capture in it. */}
      <div
        role="group"
        aria-label="Tool"
        className={cn(
          "flex h-auto min-h-8 min-w-0 flex-wrap items-center overflow-hidden rounded-md border border-input",
          // One opacity on the group, not six: a per-segment fade leaves the
          // dividers and the border at full strength and reads as a rendering
          // bug. `color` itself is untouched, so the contrast sweep still sees
          // the real token.
          disabled && "opacity-50"
        )}
      >
        {TOOL_SEGMENTS.map((segment, index) => {
          const isActive = segment.value === active;
          return (
            <button
              key={segment.value}
              type="button"
              aria-label={segment.label}
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => setPaletteTool(segment.value)}
              className={cn(
                "flex h-8 items-center gap-1.5 px-2.5 text-[13px] font-semibold transition-colors duration-200 ease-swift focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed",
                index > 0 && "border-l border-input",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-secondary-foreground enabled:hover:bg-secondary-hover"
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

      <div
        role="group"
        aria-label="Annotation color"
        className={cn("flex shrink-0 items-center gap-2", disabled && "opacity-50")}
      >
        {SWATCHES.map((swatch) => {
          const isActive = !custom && swatch.value.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={swatch.value}
              type="button"
              aria-label={`${swatch.label} annotation color`}
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => setColor(swatch.value)}
              // The disc's own colour is the annotation's colour: data, so it
              // is an inline style and not a Tailwind class.
              style={{ backgroundColor: swatch.value }}
              className={cn(DISC, isActive && "ring-2 ring-ring")}
            >
              <span aria-hidden="true" className={DISC_CORE} />
            </button>
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
            disabled={disabled}
            onChange={(event) => setColor(event.target.value)}
            className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span
            aria-hidden="true"
            style={{ background: COLOR_WHEEL }}
            className={cn(
              DISC,
              "pointer-events-none",
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
