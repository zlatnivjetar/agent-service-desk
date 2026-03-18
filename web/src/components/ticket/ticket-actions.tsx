"use client"

import { useEffect, useMemo, useState } from "react"

import {
  useAssignTicket,
  useUpdateTicket,
} from "@/hooks/use-ticket-detail"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TicketDetail } from "@/types/api"

import {
  DEMO_ASSIGNEES,
  TICKET_PRIORITY_OPTIONS,
  TICKET_STATUS_OPTIONS,
  getErrorMessage,
} from "@/components/ticket/ticket-ui"

export function TicketActions({ ticket }: { ticket: TicketDetail }) {
  const updateTicket = useUpdateTicket(ticket.id)
  const assignTicket = useAssignTicket(ticket.id)

  const [statusValue, setStatusValue] = useState(ticket.status)
  const [priorityValue, setPriorityValue] = useState(ticket.priority)
  const [assigneeValue, setAssigneeValue] = useState(ticket.assignee_id ?? "")

  useEffect(() => {
    setStatusValue(ticket.status)
    setPriorityValue(ticket.priority)
    setAssigneeValue(ticket.assignee_id ?? "")
  }, [ticket.assignee_id, ticket.priority, ticket.status])

  const assigneeOptions = useMemo(() => {
    if (!ticket.assignee_id || DEMO_ASSIGNEES.some((assignee) => assignee.id === ticket.assignee_id)) {
      return DEMO_ASSIGNEES
    }

    return [
      {
        id: ticket.assignee_id,
        label: `${ticket.assignee_name ?? "Current assignee"} (current)`,
        role: "support_agent" as const,
      },
      ...DEMO_ASSIGNEES,
    ]
  }, [ticket.assignee_id, ticket.assignee_name])

  return (
    <Card id="ticket-actions" className="border-0 bg-white/90 shadow-sm ring-1 ring-foreground/8">
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ActionRow
          label="Status"
          control={
            <>
              <Select value={statusValue} onValueChange={(value) => setStatusValue(value ?? ticket.status)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => updateTicket.mutate({ status: statusValue })}
                disabled={statusValue === ticket.status || updateTicket.isPending}
                className="cursor-pointer"
              >
                Update
              </Button>
            </>
          }
        />

        <ActionRow
          label="Priority"
          control={
            <>
              <Select value={priorityValue} onValueChange={(value) => setPriorityValue(value ?? ticket.priority)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => updateTicket.mutate({ priority: priorityValue })}
                disabled={priorityValue === ticket.priority || updateTicket.isPending}
                className="cursor-pointer"
              >
                Update
              </Button>
            </>
          }
        />

        <ActionRow
          label="Assign"
          control={
            <>
              <Select value={assigneeValue} onValueChange={(value) => setAssigneeValue(value ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  {assigneeOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => assignTicket.mutate({ assignee_id: assigneeValue })}
                disabled={!assigneeValue || assigneeValue === ticket.assignee_id || assignTicket.isPending}
                className="cursor-pointer"
              >
                Assign
              </Button>
            </>
          }
        />

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => updateTicket.mutate({ status: "resolved" })}
            disabled={ticket.status === "resolved" || updateTicket.isPending}
            className="cursor-pointer bg-[#0D9488] text-white hover:bg-[#0A7C72]"
          >
            Resolve
          </Button>

          {(ticket.status === "resolved" || ticket.status === "closed") && (
            <Button
              variant="outline"
              onClick={() => updateTicket.mutate({ status: "open" })}
              disabled={updateTicket.isPending}
              className="cursor-pointer"
            >
              Reopen
            </Button>
          )}
        </div>

        {updateTicket.isError && (
          <p className="text-sm text-destructive" role="alert">
            {getErrorMessage(updateTicket.error, "Failed to update ticket")}
          </p>
        )}

        {assignTicket.isError && (
          <p className="text-sm text-destructive" role="alert">
            {getErrorMessage(assignTicket.error, "Failed to assign ticket")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ActionRow({
  label,
  control,
}: {
  label: string
  control: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-2">{control}</div>
    </div>
  )
}
