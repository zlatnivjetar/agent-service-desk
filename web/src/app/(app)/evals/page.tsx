"use client"

import { useCurrentUser } from "@/hooks/use-current-user"

export default function EvalsPage() {
  const { data: user, isPending } = useCurrentUser()

  if (isPending) return null

  if (user?.role !== "team_lead") {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-base font-medium text-foreground">Access denied</p>
        <p className="text-sm text-muted-foreground">
          The eval console is available to team leads only.
        </p>
      </div>
    )
  }

  return <h1 className="text-2xl font-semibold text-[#0F172A]">Eval Console</h1>
}
