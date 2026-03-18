import * as React from "react"

import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="scroll-area"
        className={cn("overflow-auto", className)}
        {...props}
      />
    )
  }
)

ScrollArea.displayName = "ScrollArea"

export { ScrollArea }
