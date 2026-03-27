import { Suspense } from "react"

import TicketsPageClient from "@/app/(app)/tickets/tickets-page-client"
import { TicketsTableSection } from "@/app/(app)/tickets/tickets-table-section"
import { DataTable, DataTableSkeleton } from "@/components/ui/data-table"
import { TableBody } from "@/components/ui/table"
import type { RouteSearchParams } from "@/lib/route-params"

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>
}) {
  const resolvedSearchParams = await searchParams

  return (
    <TicketsPageClient
      tableSection={
        <Suspense fallback={<TicketsTableSectionFallback />}>
          <TicketsTableSection searchParams={resolvedSearchParams} />
        </Suspense>
      }
    />
  )
}

function TicketsTableSectionFallback() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="min-h-5 text-sm text-muted-foreground">\u00A0</p>
        <p className="min-h-4 text-xs text-muted-foreground">\u00A0</p>
      </div>
      <DataTable>
        <TableBody>
          <DataTableSkeleton
            columns={8}
            columnWidths={["w-64", "w-24", "w-24", "w-24", "w-24", "w-24", "w-24", "w-24"]}
          />
        </TableBody>
      </DataTable>
    </div>
  )
}
