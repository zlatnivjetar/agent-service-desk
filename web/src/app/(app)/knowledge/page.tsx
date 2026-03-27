import { Suspense } from "react"

import KnowledgePageClient from "@/app/(app)/knowledge/knowledge-page-client"
import { KnowledgeListSection } from "@/app/(app)/knowledge/knowledge-list-section"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { RouteSearchParams } from "@/lib/route-params"
import { getServerAuthContext } from "@/lib/server-auth"

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>
}) {
  const resolvedSearchParams = await searchParams
  const authContext = await getServerAuthContext()

  return (
    <KnowledgePageClient
      listSection={
        authContext?.currentUser.role !== "client_user" ? (
          <Suspense fallback={<KnowledgeListFallback />}>
            <KnowledgeListSection searchParams={resolvedSearchParams} />
          </Suspense>
        ) : null
      }
    />
  )
}

function KnowledgeListFallback() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="min-h-5 text-sm text-muted-foreground">&nbsp;</p>
        <p className="min-h-4 text-xs text-muted-foreground">&nbsp;</p>
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <div className="flex gap-2 pt-0.5">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
