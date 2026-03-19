"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface FilterOption {
  value: string
  label: string
}

interface FilterSelectProps {
  value: string | null | undefined
  onValueChange: (value: string) => void
  placeholder: string
  options: FilterOption[]
  className?: string
}

export function FilterSelect({
  value,
  onValueChange,
  placeholder,
  options,
  className,
}: FilterSelectProps) {
  const selectedLabel = options.find((opt) => opt.value === value)?.label
  return (
    <Select value={value ?? ""} onValueChange={(v) => onValueChange(v ?? "")}>
      <SelectTrigger className={cn("w-40", className)}>
        <SelectValue placeholder={placeholder}>
          {selectedLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
