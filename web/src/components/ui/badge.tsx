import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border px-3 text-[0.78rem] leading-none font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default:
          "border-border bg-secondary text-foreground",
        secondary:
          "border-border bg-background text-secondary-foreground",
        destructive:
          "border-destructive-border bg-destructive-soft text-destructive focus-visible:ring-destructive/20",
        outline: "border-border bg-background text-foreground",
        ghost:
          "border-transparent bg-transparent text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  dotClassName,
  dotStyle,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    dotClassName?: string
    dotStyle?: React.CSSProperties
  }) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {dotClassName || dotStyle ? (
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-full", dotClassName)}
          style={dotStyle}
        />
      ) : null}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
