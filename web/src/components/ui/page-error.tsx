import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PageErrorProps {
  message: string
  onRetry?: () => void
}

export function PageError({ message, onRetry }: PageErrorProps) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertCircle className="size-8 text-destructive" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="cursor-pointer">
          Retry
        </Button>
      )}
    </div>
  )
}
