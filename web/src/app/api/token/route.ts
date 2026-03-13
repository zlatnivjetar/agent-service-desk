import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { auth } from "@/lib/auth";

// Singleton pool — reused across warm invocations
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      user_id: string;
      org_id: string;
      workspace_id: string;
      role: string;
    }>(
      `SELECT u.id AS user_id, m.org_id, wm.workspace_id, wm.role
       FROM users u
       JOIN memberships m ON m.user_id = u.id
       JOIN workspace_memberships wm ON wm.user_id = u.id
       WHERE u.email = $1
       LIMIT 1`,
      [session.user.email],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "User not found in workspace" },
        { status: 403 },
      );
    }

    const { user_id, org_id, workspace_id, role } = rows[0];
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);

    const token = await new SignJWT({ user_id, org_id, workspace_id, role })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);

    return NextResponse.json({ token });
  } finally {
    client.release();
  }
}
