"use client"

import { Input } from "@/components/ui/input"
import { FilterSelect } from "@/components/ui/filter-select"
import { DATE_RANGE_OPTIONS } from "@/lib/dashboard"
import type { DashboardRangePreset } from "@/types/api"

interface DateRangeControlsProps {
  range: DashboardRangePreset
  from: string | null
  to: string | null
  onRangeChange: (value: DashboardRangePreset) => void
  onFromChange: (value: string | null) => void
  onToChange: (value: string | null) => void
}

export function DateRangeControls({
  range,
  from,
  to,
  onRangeChange,
  onFromChange,
  onToChange,
}: DateRangeControlsProps) {
  return (
    <>
      <FilterSelect
        value={range}
        onValueChange={(value) => onRangeChange((value || "30d") as DashboardRangePreset)}
        placeholder="Date range"
        options={DATE_RANGE_OPTIONS}
        className="w-36"
      />
      {range === "custom" ? (
        <>
          <Input
            type="date"
            value={from ?? ""}
            onChange={(event) => {
              const value = event.target.value
              if (value) {
                onFromChange(value)
              }
            }}
            className="w-40"
          />
          <Input
            type="date"
            value={to ?? ""}
            onChange={(event) => {
              const value = event.target.value
              if (value) {
                onToChange(value)
              }
            }}
            className="w-40"
          />
        </>
      ) : null}
    </>
  )
}
