"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

const ROUTE_LABELS: Record<string, string> = {
  tickets: "Tickets",
  reviews: "Review Queue",
  knowledge: "Knowledge",
  evals: "Eval Console",
}

export function PageBreadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  if (segments.length === 0) return null

  const crumbs: { label: string; href?: string }[] = []

  if (segments[0] && ROUTE_LABELS[segments[0]]) {
    crumbs.push({
      label: ROUTE_LABELS[segments[0]],
      href: segments.length > 1 ? `/${segments[0]}` : undefined,
    })
  }

  if (segments.length > 1) {
    const id = segments[1]
    crumbs.push({ label: `#${id.slice(0, 8)}` })
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {crumb.href ? (
                <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
