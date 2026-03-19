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
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {hasActiveFilters && onClear && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="cursor-pointer"
        >
          Clear filters
        </Button>
      )}
    </div>
  )
}
