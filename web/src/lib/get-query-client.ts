import { cache } from "react"

import { makeQueryClient } from "@/lib/query-client"

export const getQueryClient = cache(makeQueryClient)
