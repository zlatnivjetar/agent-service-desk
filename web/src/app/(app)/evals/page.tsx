"use client"

import { useState } from "react"

import { useCurrentUser } from "@/hooks/use-current-user"
import { RunEvalForm } from "@/components/eval/run-eval-form"
import { EvalRunsList } from "@/components/eval/eval-runs-list"
import { EvalComparisonView } from "@/components/eval/eval-comparison"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageLoading } from "@/components/ui/page-loading"

export default function EvalsPage() {
  const { data: user, isPending } = useCurrentUser()
  const [activeTab, setActiveTab] = useState("run")
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([])

  if (isPending) return <PageLoading />

  if (user?.role !== "team_lead") {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-base font-medium text-foreground">Access restricted</p>
        <p className="text-sm text-muted-foreground">
          The evaluation console is available to team leads only.
        </p>
      </div>
    )
  }

  function handleRunStarted() {
    setActiveTab("runs")
  }

  function handleCompare() {
    setActiveTab("compare")
  }

  const compareDisabled = selectedRunIds.length !== 2

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eval Console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Run evaluations and compare prompt versions.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="run" className="cursor-pointer">
            Run Evaluation
          </TabsTrigger>
          <TabsTrigger value="runs" className="cursor-pointer">
            Runs
          </TabsTrigger>
          <TabsTrigger
            value="compare"
            disabled={compareDisabled}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            Compare
            {selectedRunIds.length > 0 && (
              <Badge
                className="ml-1.5 px-2 text-[10px]"
                dotClassName="bg-primary"
              >
                {selectedRunIds.length}/2
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="mt-6">
          <div className="max-w-xl">
            <RunEvalForm onRunStarted={handleRunStarted} />
          </div>
        </TabsContent>

        <TabsContent value="runs" className="mt-6">
          <EvalRunsList
            selectedRunIds={selectedRunIds}
            onSelectionChange={setSelectedRunIds}
            onCompare={handleCompare}
          />
        </TabsContent>

        <TabsContent value="compare" className="mt-6">
          {compareDisabled ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-base font-medium text-foreground">
                No runs selected
              </p>
              <p className="text-sm text-muted-foreground">
                Select exactly 2 runs from the Runs tab to compare them.
              </p>
            </div>
          ) : (
            <EvalComparisonView
              runAId={selectedRunIds[0]}
              runBId={selectedRunIds[1]}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
