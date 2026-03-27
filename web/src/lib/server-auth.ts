import { SignJWT } from "jose"
import type { JWTPayload } from "jose"
import { headers } from "next/headers"
import { Pool } from "pg"
import { cache } from "react"

import { auth } from "@/lib/auth"
import type { CurrentUser } from "@/types/api"

const authPool = new Pool({ connectionString: process.env.DATABASE_URL })

export type ServerAuthContext = {
  currentUser: CurrentUser
  token: string
}

async function resolveCurrentUserForEmail(email: string): Promise<CurrentUser | null> {
  const client = await authPool.connect()

  try {
    const { rows } = await client.query<CurrentUser>(
      `SELECT u.id AS user_id, m.org_id, wm.workspace_id, wm.role, u.full_name AS name
       FROM users u
       JOIN memberships m ON m.user_id = u.id
       JOIN workspace_memberships wm ON wm.user_id = u.id
       WHERE u.email = $1
       LIMIT 1`,
      [email]
    )

    return rows[0] ?? null
  } finally {
    client.release()
  }
}

async function signApiToken(user: CurrentUser) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET)

  return new SignJWT({ ...user } as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret)
}

export async function getServerAuthContextFromHeaders(
  requestHeaders: Headers
): Promise<ServerAuthContext | null> {
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session?.user?.email) {
    return null
  }

  const currentUser = await resolveCurrentUserForEmail(session.user.email)
  if (!currentUser) {
    return null
  }

  const token = await signApiToken(currentUser)

  return { currentUser, token }
}

export const getServerAuthContext = cache(async () => {
  const requestHeaders = await headers()
  return getServerAuthContextFromHeaders(requestHeaders)
})
