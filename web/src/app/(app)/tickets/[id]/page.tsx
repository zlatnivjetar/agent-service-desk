import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import TicketDetailPageClient from "@/app/(app)/tickets/[id]/ticket-detail-page-client"
import { getQueryClient } from "@/lib/get-query-client"
import { ticketDetailQueryOptions } from "@/lib/queries/tickets"
import { serverApiClient } from "@/lib/server-api-client"

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const queryClient = getQueryClient()

  if (id) {
    await queryClient.prefetchQuery(ticketDetailQueryOptions(id, serverApiClient))
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TicketDetailPageClient />
    </HydrationBoundary>
  )
}
