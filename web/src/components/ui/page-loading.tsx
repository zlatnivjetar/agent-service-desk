import { Loader2 } from "lucide-react"

export function PageLoading() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}
