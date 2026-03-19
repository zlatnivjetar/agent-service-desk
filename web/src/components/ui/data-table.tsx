"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Table, TableCell, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

interface DataTableProps {
  children: React.ReactNode
  className?: string
}

export function DataTable({ children, className }: DataTableProps) {
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <Table>{children}</Table>
    </div>
  )
}

interface DataTableSkeletonProps {
  columns: number
  rows?: number
  columnWidths?: string[]
}

export function DataTableSkeleton({
  columns,
  rows = 5,
  columnWidths,
}: DataTableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: columns }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className={cn("h-4", columnWidths?.[j] ?? "w-24")} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

interface DataTableEmptyProps {
  colSpan: number
  icon?: React.ReactNode
  message: string
  action?: React.ReactNode
}

export function DataTableEmpty({
  colSpan,
  icon,
  message,
  action,
}: DataTableEmptyProps) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-40 text-center">
        <div className="flex flex-col items-center gap-2">
          {icon}
          <p className="text-muted-foreground">{message}</p>
          {action}
        </div>
      </TableCell>
    </TableRow>
  )
}

interface DataTablePaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function DataTablePagination({
  page,
  totalPages,
  onPageChange,
}: DataTablePaginationProps) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="cursor-pointer"
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="cursor-pointer"
        >
          Next
        </Button>
      </div>
    </div>
  )
}
