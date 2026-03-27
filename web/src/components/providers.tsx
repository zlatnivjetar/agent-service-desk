"use client"

import { QueryClientProvider, useQueryClient } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useEffect, useRef, useState } from "react"

import { authClient } from "@/lib/auth-client"
import { clearTokenCache } from "@/lib/api-client"
import { makeQueryClient } from "@/lib/query-client"

function AuthQueryStateSync() {
  const queryClient = useQueryClient()
  const { data: session, isPending } = authClient.useSession()
  const previousUserId = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (isPending) return

    const currentUserId = session?.user?.id ?? null
    if (previousUserId.current === undefined) {
      previousUserId.current = currentUserId
      return
    }

    if (previousUserId.current !== currentUserId) {
      clearTokenCache()
      queryClient.clear()
    }

    previousUserId.current = currentUserId
  }, [isPending, queryClient, session?.user?.id])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <AuthQueryStateSync />
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  )
}
