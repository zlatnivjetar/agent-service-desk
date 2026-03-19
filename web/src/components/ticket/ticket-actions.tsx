"use client"

import { useState } from "react"

import { toast } from "sonner"
import {
  useAssignTicket,
  useUpdateTicket,
} from "@/hooks/use-ticket-detail"
import { useWorkspaceUsers } from "@/hooks/use-users"
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
  TICKET_PRIORITY_OPTIONS,
  TICKET_STATUS_OPTIONS,
  getErrorMessage,
} from "@/components/ticket/ticket-ui"

export function TicketActions({ ticket }: { ticket: TicketDetail }) {
  const { data: workspaceUsers } = useWorkspaceUsers()
  const updateTicket = useUpdateTicket(ticket.id)
  const assignTicket = useAssignTicket(ticket.id)

  return (
    <TicketActionsContent
      key={`${ticket.id}:${ticket.status}:${ticket.priority}:${ticket.assignee_id ?? ""}`}
      ticket={ticket}
      workspaceUsers={workspaceUsers ?? []}
      updateTicket={updateTicket}
      assignTicket={assignTicket}
    />
  )
}

type TicketActionsMutation = ReturnType<typeof useUpdateTicket>
type TicketAssignMutation = ReturnType<typeof useAssignTicket>

function TicketActionsContent({
  ticket,
  workspaceUsers,
  updateTicket,
  assignTicket,
}: {
  ticket: TicketDetail
  workspaceUsers: NonNullable<ReturnType<typeof useWorkspaceUsers>["data"]>
  updateTicket: TicketActionsMutation
  assignTicket: TicketAssignMutation
}) {
  const [statusValue, setStatusValue] = useState(ticket.status)
  const [priorityValue, setPriorityValue] = useState(ticket.priority)
  const [assigneeValue, setAssigneeValue] = useState(ticket.assignee_id ?? "")

  const assigneeOptions = workspaceUsers.map((u) => ({
    id: u.id,
    label: u.full_name,
    role: u.role,
  }))

  return (
    <Card id="ticket-actions">
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
                  <SelectValue placeholder="Select status">
                    {TICKET_STATUS_OPTIONS.find((o) => o.value === statusValue)?.label}
                  </SelectValue>
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
                onClick={() => updateTicket.mutate({ status: statusValue }, {
                  onSuccess: () => toast.success("Ticket updated"),
                  onError: (e) => toast.error(getErrorMessage(e, "Failed to update ticket")),
                })}
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
                  <SelectValue placeholder="Select priority">
                    {TICKET_PRIORITY_OPTIONS.find((o) => o.value === priorityValue)?.label}
                  </SelectValue>
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
                onClick={() => updateTicket.mutate({ priority: priorityValue }, {
                  onSuccess: () => toast.success("Ticket updated"),
                  onError: (e) => toast.error(getErrorMessage(e, "Failed to update ticket")),
                })}
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
                  <SelectValue placeholder="Select assignee">
                    {assigneeValue
                      ? (assigneeOptions.find((o) => o.id === assigneeValue)?.label
                          ?? ticket.assignee_name
                          ?? "Unknown")
                      : undefined}
                  </SelectValue>
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
                onClick={() => assignTicket.mutate({ assignee_id: assigneeValue }, {
                  onSuccess: () => toast.success("Ticket assigned"),
                  onError: (e) => toast.error(getErrorMessage(e, "Failed to assign ticket")),
                })}
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
            onClick={() => updateTicket.mutate({ status: "resolved" }, {
              onSuccess: () => toast.success("Ticket updated"),
              onError: (e) => toast.error(getErrorMessage(e, "Failed to update ticket")),
            })}
            disabled={ticket.status === "resolved" || updateTicket.isPending}
            className="cursor-pointer"
          >
            Resolve
          </Button>

          {(ticket.status === "resolved" || ticket.status === "closed") && (
            <Button
              variant="outline"
              onClick={() => updateTicket.mutate({ status: "open" }, {
                onSuccess: () => toast.success("Ticket updated"),
                onError: (e) => toast.error(getErrorMessage(e, "Failed to update ticket")),
              })}
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{control}</div>
    </div>
  )
}
