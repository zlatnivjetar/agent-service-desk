"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface FilterBarProps {
  children: React.ReactNode
  onClear?: () => void
  hasActiveFilters?: boolean
  actions?: React.ReactNode
  className?: string
}

export function FilterBar({
  children,
  onClear,
  hasActiveFilters,
  actions,
  className,
}: FilterBarProps) {
  const hasTrailingActions = Boolean(actions) || (hasActiveFilters && onClear)

  return (
    <div
      role="toolbar"
      aria-label="Filters"
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-border/70 surface-shadow-sm sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {children}
      </div>
      {hasTrailingActions ? (
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {actions}
          {hasActiveFilters && onClear ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              className="cursor-pointer"
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
