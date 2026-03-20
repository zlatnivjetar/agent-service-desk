"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { PageLoading } from "@/components/ui/page-loading"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useDashboardPreferences } from "@/hooks/use-dashboard"

export default function Home() {
  const router = useRouter()
  const { data: user, isPending } = useCurrentUser()
  const isInternal = user?.role === "support_agent" || user?.role === "team_lead"
  const { data: preferences, isPending: preferencesPending } = useDashboardPreferences({
    enabled: isInternal,
  })

  useEffect(() => {
    if (isPending) return
    if (!user) return
    if (user.role === "client_user") {
      router.replace("/tickets")
      return
    }
    if (preferencesPending) return
    router.replace(preferences?.landing_page === "tickets" ? "/tickets" : "/overview")
  }, [isPending, preferences?.landing_page, preferencesPending, router, user])

  return <PageLoading />
}
