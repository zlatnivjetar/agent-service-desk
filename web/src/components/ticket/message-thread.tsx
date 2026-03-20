"use client"

import { useEffect, useRef } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatRelativeTime, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { TicketMessage } from "@/types/api"

import {
  SenderBadge,
  formatEnumLabel,
  getInitials,
} from "@/components/ticket/ticket-ui"

export function MessageThread({ messages }: { messages: TicketMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    element.scrollTop = element.scrollHeight
  }, [messages.length])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Message Thread</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea
          ref={scrollRef}
          className="max-h-[60vh] pr-2 lg:max-h-[calc(100vh-300px)]"
        >
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No messages yet.
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={cn(
                    "rounded-xl border p-4 transition-colors",
                    message.is_internal
                      ? "border-warning-border bg-warning-soft surface-shadow-sm"
                      : message.sender_type === "agent" || message.sender_type === "system"
                        ? "border-primary-border bg-primary-soft"
                        : "border-border/80 bg-background"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarFallback>{getInitials(message.sender_name ?? formatEnumLabel(message.sender_type))}</AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {message.sender_name ?? formatEnumLabel(message.sender_type)}
                        </span>
                        <SenderBadge senderType={message.sender_type} />
                        {message.is_internal && (
                          <Badge dotClassName="bg-warning">
                            Internal note
                          </Badge>
                        )}
                        <span
                          className="text-xs text-muted-foreground"
                          title={formatDateTime(message.created_at)}
                        >
                          {formatRelativeTime(message.created_at)}
                        </span>
                      </div>

                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {message.body}
                      </p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
