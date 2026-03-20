import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

export function AppPage({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-6", className)} {...props} />
}

type PageHeaderProps = {
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  className?: string
  titleClassName?: string
  metaClassName?: string
}

export function PageHeader({
  title,
  meta,
  actions,
  className,
  titleClassName,
  metaClassName,
}: PageHeaderProps) {
  const metaContent =
    typeof meta === "string" || typeof meta === "number" ? <p>{meta}</p> : meta

  return (
    <div
      className={cn(
        "flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className={cn("text-2xl font-semibold tracking-tight", titleClassName)}>
          {title}
        </h1>
        {metaContent ? (
          <div
            className={cn(
              "mt-1 flex flex-col gap-1 text-sm text-muted-foreground",
              metaClassName
            )}
          >
            {metaContent}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-start gap-2">{actions}</div> : null}
    </div>
  )
}
