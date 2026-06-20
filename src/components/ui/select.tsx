import * as React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getNextIndex, matchTypeahead, type ListboxKey } from "@/lib/selectNavigation";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

const TYPEAHEAD_RESET_MS = 600;

function Select({
  value,
  onValueChange,
  options,
  className,
  disabled,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby
}: SelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const typeahead = useRef<{ query: string; timer: number | null }>({ query: "", timer: null });

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number): string => `${baseId}-option-${index}`;

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : "";

  const openList = useCallback((): void => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [selectedIndex]);

  const closeList = useCallback((focusButton = true): void => {
    setOpen(false);
    setActiveIndex(-1);
    if (focusButton) buttonRef.current?.focus();
  }, []);

  const commit = useCallback(
    (index: number): void => {
      const option = options[index];
      if (option) onValueChange(option.value);
      closeList();
    },
    [options, onValueChange, closeList]
  );

  // Close when a pointer goes down outside the component.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active option scrolled into view (by index — option ids contain
  // `:` from useId and are not valid CSS selectors).
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.children.item(activeIndex) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const runTypeahead = useCallback(
    (char: string): void => {
      const state = typeahead.current;
      state.query += char;
      if (state.timer) window.clearTimeout(state.timer);
      state.timer = window.setTimeout(() => {
        state.query = "";
        state.timer = null;
      }, TYPEAHEAD_RESET_MS);

      const match = matchTypeahead(
        options.map((option) => option.label),
        state.query,
        activeIndex >= 0 ? activeIndex : 0
      );
      if (match >= 0) setActiveIndex(match);
    },
    [options, activeIndex]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    const { key } = event;

    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        openList();
      }
      return;
    }

    switch (key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Home":
      case "End":
        event.preventDefault();
        setActiveIndex((current) => getNextIndex(current, options.length, key as ListboxKey));
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (activeIndex >= 0) commit(activeIndex);
        return;
      case "Escape":
        event.preventDefault();
        closeList();
        return;
      case "Tab":
        // Let focus leave naturally; just dismiss the list.
        setOpen(false);
        setActiveIndex(-1);
        return;
      default:
        if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          runTypeahead(key);
        }
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        disabled={disabled}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-left text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-swift",
            open && "rotate-180"
          )}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-md border border-border bg-card p-1 shadow-lg"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-sm",
                  active ? "bg-primary text-primary-foreground" : "text-foreground"
                )}
              >
                <span className="truncate">{option.label}</span>
                {selected ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4 shrink-0"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export { Select };
