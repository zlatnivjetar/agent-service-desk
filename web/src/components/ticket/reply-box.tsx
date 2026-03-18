"use client"

import { useEffect, useState } from "react"
import { Send, Sparkles } from "lucide-react"

import { toast } from "sonner"
import { useAddMessage } from "@/hooks/use-ticket-detail"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { UserRole } from "@/types/api"

import { getErrorMessage } from "@/components/ticket/ticket-ui"

export function ReplyBox({
  ticketId,
  role,
}: {
  ticketId: string
  role: UserRole
}) {
  const addMessage = useAddMessage(ticketId)
  const [body, setBody] = useState("")
  const [isInternal, setIsInternal] = useState(false)

  useEffect(() => {
    if (!addMessage.isSuccess) return

    const timeoutId = window.setTimeout(() => addMessage.reset(), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [addMessage, addMessage.isSuccess])

  function submitMessage() {
    const trimmedBody = body.trim()
    if (!trimmedBody) return

    addMessage.mutate(
      {
        body: trimmedBody,
        is_internal: role === "client_user" ? false : isInternal,
      },
      {
        onSuccess: () => {
          setBody("")
          setIsInternal(false)
          toast.success("Message sent")
        },
        onError: (e) => toast.error(getErrorMessage(e, "Failed to send message")),
      }
    )
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submitMessage()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      if (!body.trim() || addMessage.isPending) return
      submitMessage()
    }
  }

  return (
    <Card className="border-0 bg-white/90 shadow-sm ring-1 ring-foreground/8">
      <CardHeader>
        <CardTitle>Reply</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write your reply…  (Ctrl+Enter to send)"
            className="min-h-32 bg-background/80"
          />

          {role !== "client_user" && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(event) => setIsInternal(event.target.checked)}
                className="size-4 rounded border-input accent-[#0D9488]"
              />
              Internal note
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-h-5 text-sm" role={addMessage.isError ? "alert" : undefined}>
              {addMessage.isError ? (
                <span className="text-destructive">
                  {getErrorMessage(addMessage.error, "Failed to send message")}
                </span>
              ) : addMessage.isSuccess ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <Sparkles className="size-3.5" />
                  Message sent.
                </span>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={!body.trim() || addMessage.isPending}
              className="cursor-pointer bg-[#F97316] text-white hover:bg-[#EA6A0A]"
            >
              <Send className="size-4" />
              {addMessage.isPending ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
