"use client"

import type { ReactNode } from "react"
import { useSearchParams } from "next/navigation"

import { useCurrentUser } from "@/hooks/use-current-user"
import { RunEvalForm } from "@/components/eval/run-eval-form"
import { EvalComparisonView } from "@/components/eval/eval-comparison"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageLoading } from "@/components/ui/page-loading"
import { AppPage, PageHeader } from "@/components/app-page"
import { replaceUrl } from "@/lib/url-state"

function parseSelectedRunIds(value: string | null) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((runId) => runId.trim())
        .filter(Boolean)
    )
  ).slice(0, 2)
}

function buildEvalsHref(
  searchParams: Readonly<URLSearchParams>,
  updates: {
    tab?: "run" | "runs" | "compare"
    expandedRunId?: string | null
  }
) {
  const next = new URLSearchParams(searchParams.toString())

  if (updates.tab) {
    if (updates.tab === "run") {
      next.delete("tab")
    } else {
      next.set("tab", updates.tab)
    }
  }

  if ("expandedRunId" in updates) {
    if (updates.expandedRunId) {
      next.set("expanded", updates.expandedRunId)
    } else {
      next.delete("expanded")
    }
  }

  const query = next.toString()
  return query ? `/evals?${query}` : "/evals"
}

function EvalsPageContent({ runsSection }: { runsSection: ReactNode }) {
  const searchParams = useSearchParams()
  const { data: user, isPending } = useCurrentUser()
  const activeTab =
    searchParams.get("tab") === "runs" || searchParams.get("tab") === "compare"
      ? (searchParams.get("tab") as "run" | "runs" | "compare")
      : "run"
  const selectedRunIds = parseSelectedRunIds(searchParams.get("selected"))

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
    replaceUrl(buildEvalsHref(searchParams, { tab: "runs", expandedRunId: null }))
  }

  function handleCompare() {
    replaceUrl(buildEvalsHref(searchParams, { tab: "compare" }))
  }

  const compareDisabled = selectedRunIds.length !== 2

  return (
    <AppPage>
      <PageHeader
        title="Eval Console"
        meta={<p>Run evaluations and compare prompt versions.</p>}
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          replaceUrl(
            buildEvalsHref(searchParams, {
              tab: value as "run" | "runs" | "compare",
            })
          )
        }}
      >
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
          <div className="space-y-3">
            {selectedRunIds.length === 2 ? (
              <div className="flex flex-col gap-3 rounded-lg border border-primary-border bg-primary-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-foreground">
                  2 runs selected for comparison
                </p>
                <Button
                  size="sm"
                  onClick={handleCompare}
                  className="cursor-pointer"
                >
                  Compare
                </Button>
              </div>
            ) : null}
            {runsSection}
          </div>
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
    </AppPage>
  )
}

export default function EvalsPageClient({
  runsSection,
}: {
  runsSection: ReactNode
}) {
  return <EvalsPageContent runsSection={runsSection} />
}
