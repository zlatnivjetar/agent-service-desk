"use client"

import { useState } from "react"
import { LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { useEvalSets, usePromptVersions, useCreateEvalRun } from "@/hooks/use-evals"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface RunEvalFormProps {
  onRunStarted: () => void
}

export function RunEvalForm({ onRunStarted }: RunEvalFormProps) {
  const [evalSetId, setEvalSetId] = useState("")
  const [promptVersionId, setPromptVersionId] = useState("")

  const { data: evalSets, isLoading: setsLoading } = useEvalSets()
  const { data: promptVersions, isLoading: versionsLoading } = usePromptVersions()
  const createRun = useCreateEvalRun()

  const isLoading = setsLoading || versionsLoading
  const canSubmit = !!evalSetId && !!promptVersionId && !createRun.isPending

  const selectedSet = evalSets?.find((s) => s.id === evalSetId)
  const selectedVersion = promptVersions?.find((v) => v.id === promptVersionId)

  function handleSubmit() {
    if (!evalSetId || !promptVersionId) return
    createRun.mutate(
      { eval_set_id: evalSetId, prompt_version_id: promptVersionId },
      {
        onSuccess: () => {
          setEvalSetId("")
          setPromptVersionId("")
          toast.success("Evaluation started")
          onRunStarted()
        },
        onError: (e) => toast.error((e as Error)?.message || "Failed to start run"),
      }
    )
  }

  return (
    <Card className="border-0 bg-white/90 shadow-sm ring-1 ring-foreground/8">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-[#0F172A]">
          New Evaluation Run
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        {/* Eval Set */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Eval Set</label>
          <Select
            disabled={isLoading}
            value={evalSetId}
            onValueChange={(v) => setEvalSetId(v ?? "")}
          >
            <SelectTrigger className="w-full cursor-pointer">
              <SelectValue placeholder={setsLoading ? "Loading…" : "Select an eval set"}>
                {selectedSet
                  ? `${selectedSet.name} (${selectedSet.example_count} examples)`
                  : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(evalSets ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id} className="cursor-pointer">
                  {s.name}{" "}
                  <span className="text-muted-foreground">
                    ({s.example_count} examples)
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prompt Version */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Prompt Version
          </label>
          <Select
            disabled={isLoading}
            value={promptVersionId}
            onValueChange={(v) => setPromptVersionId(v ?? "")}
          >
            <SelectTrigger className="w-full cursor-pointer">
              <SelectValue
                placeholder={versionsLoading ? "Loading…" : "Select a prompt version"}
              >
                {selectedVersion ? (
                  <span className="flex items-center gap-2">
                    {selectedVersion.name}
                    <span className="text-xs text-muted-foreground">
                      {selectedVersion.type}
                    </span>
                    {selectedVersion.is_active && (
                      <Badge
                        variant="secondary"
                        className="h-4 px-1 py-0 text-[10px]"
                      >
                        active
                      </Badge>
                    )}
                  </span>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(promptVersions ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id} className="cursor-pointer">
                  {v.name}
                  <span className="text-xs text-muted-foreground">{v.type}</span>
                  {v.is_active && (
                    <Badge
                      variant="secondary"
                      className="h-4 px-1 py-0 text-[10px]"
                    >
                      active
                    </Badge>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {createRun.isError && (
          <p className="text-sm text-destructive" role="alert">
            {(createRun.error as Error)?.message ?? "Failed to start run"}
          </p>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="cursor-pointer bg-[#F97316] text-white hover:bg-[#EA6A0A]"
        >
          {createRun.isPending ? (
            <>
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              Starting…
            </>
          ) : (
            "Run Evaluation"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
