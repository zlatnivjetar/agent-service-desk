"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface FilterBarProps {
  children: React.ReactNode
  onClear?: () => void
  hasActiveFilters?: boolean
  className?: string
}

export function FilterBar({
  children,
  onClear,
  hasActiveFilters,
  className,
}: FilterBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Filters"
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-card p-3 shadow-sm ring-1 ring-foreground/8 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {children}
      </div>
      {hasActiveFilters && onClear ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          className="cursor-pointer self-start sm:self-auto"
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
