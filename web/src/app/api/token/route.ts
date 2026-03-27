import { NextRequest, NextResponse } from "next/server"

import { getServerAuthContextFromHeaders } from "@/lib/server-auth"

export async function POST(request: NextRequest) {
  const authContext = await getServerAuthContextFromHeaders(request.headers)

  if (!authContext) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  return NextResponse.json({ token: authContext.token })
}
