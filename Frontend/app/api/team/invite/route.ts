import { randomBytes, createHash } from "node:crypto";
import { auth, database } from "@/lib/auth";
export async function POST(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL || request.url).origin
  )
    return Response.json({ detail: "Invalid origin" }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ detail: "Sign in required" }, { status: 401 });
  const actor = await database.query(
    "SELECT role FROM users WHERE lower(email)=lower($1) AND is_active",
    [session.user.email],
  );
  if (actor.rows[0]?.role !== "super_admin")
    return Response.json(
      { detail: "Administrator access required" },
      { status: 403 },
    );
  const { email } = await request.json();
  const user = await database.query(
    "SELECT email FROM users WHERE lower(email)=lower($1) AND is_active",
    [email],
  );
  if (!user.rows[0])
    return Response.json(
      { detail: "Create and activate the CRM user first." },
      { status: 404 },
    );
  const existing = await database.query(
    'SELECT id FROM "user" WHERE lower(email)=lower($1)',
    [email],
  );
  if (existing.rows[0])
    return Response.json(
      {
        detail:
          "This person already has a login. Use password recovery instead.",
      },
      { status: 409 },
    );
  const token = randomBytes(32).toString("hex");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT id FROM users WHERE lower(email)=lower($1) FOR UPDATE",
      [email],
    );
    await client.query(
      "DELETE FROM user_invitations WHERE lower(email)=lower($1)",
      [email],
    );
    await client.query(
      "INSERT INTO user_invitations(token_hash,email,expires_at) VALUES($1,$2,now()+interval '48 hours')",
      [createHash("sha256").update(token).digest("hex"), user.rows[0].email],
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return Response.json(
      { detail: "Could not create invitation. Retry." },
      { status: 500 },
    );
  } finally {
    client.release();
  }
  return Response.json(
    {
      url: `${new URL(process.env.BETTER_AUTH_URL || request.url).origin}/accept-invite?token=${token}`,
      expires_in_hours: 48,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
