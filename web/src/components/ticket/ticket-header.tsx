"use client"

import { Clock3 } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTime } from "@/lib/format"
import type { TicketDetail, UserRole } from "@/types/api"

import {
  PriorityBadge,
  StatusBadge,
  formatEnumLabel,
  getInitials,
  getSlaLabel,
  isPrivilegedRole,
} from "@/components/ticket/ticket-ui"

export function TicketHeader({
  ticket,
  role,
  onAssignClick,
}: {
  ticket: TicketDetail
  role: UserRole
  onAssignClick?: () => void
}) {
  const showAssignButton = isPrivilegedRole(role) && !ticket.assignee_id

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {ticket.subject}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{ticket.org_name ?? "Unknown organization"}</p>
          </div>

          <div className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 sm:w-auto sm:min-w-[220px]">
            <Avatar size="lg">
              <AvatarFallback>{getInitials(ticket.assignee_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex flex-col gap-0.5">
              <span className="truncate whitespace-nowrap text-sm font-semibold text-foreground">
                {ticket.assignee_name ?? "Unassigned"}
              </span>
              {showAssignButton ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAssignClick}
                  className="cursor-pointer"
                >
                  Assign
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {ticket.assignee_id ? "Current owner" : "Awaiting assignment"}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <Badge dotClassName="bg-neutral">{formatEnumLabel(ticket.category, "Uncategorized")}</Badge>
          <Badge dotClassName="bg-neutral">{formatEnumLabel(ticket.team, "No team")}</Badge>
          <Badge dotClassName="bg-primary">{getSlaLabel(ticket.priority)}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-4" />
            Created {formatDateTime(ticket.created_at)}
          </span>
          <span>Updated {formatDateTime(ticket.updated_at)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
