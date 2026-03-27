import { Suspense } from "react"

import ReviewsPageClient from "@/app/(app)/reviews/reviews-page-client"
import { ReviewsListSection } from "@/app/(app)/reviews/reviews-list-section"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { RouteSearchParams } from "@/lib/route-params"

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>
}) {
  const resolvedSearchParams = await searchParams

  return (
    <ReviewsPageClient
      listSection={
        <Suspense fallback={<ReviewsListFallback />}>
          <ReviewsListSection searchParams={resolvedSearchParams} />
        </Suspense>
      }
    />
  )
}

function ReviewsListFallback() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-3">
                <Skeleton className="h-6 w-24 rounded-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
