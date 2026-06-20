import * as React from "react";
import { cn } from "@/lib/utils";

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: SeparatorProps): JSX.Element {
  return (
    <div
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "shrink-0",
        orientation === "horizontal"
          ? "h-px w-full bg-gradient-to-r from-transparent via-border to-transparent"
          : "h-full w-px bg-gradient-to-b from-transparent via-border to-transparent",
        className
      )}
      {...props}
    />
  );
}

export { Separator };
