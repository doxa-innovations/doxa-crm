import { createHash, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { database } from "@/lib/auth";
export async function POST(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL || request.url).origin
  )
    return Response.json({ detail: "Invalid origin" }, { status: 403 });
  const { token, password } = await request.json();
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token) ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  )
    return Response.json(
      { detail: "Use a valid invitation and a password of 12–128 characters." },
      { status: 422 },
    );
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const invitation = await client.query(
      "SELECT email FROM user_invitations WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE",
      [createHash("sha256").update(token).digest("hex")],
    );
    const email = invitation.rows[0]?.email;
    if (!email) {
      await client.query("ROLLBACK");
      return Response.json(
        {
          detail:
            "Invitation expired or already used. Ask your administrator for a new link.",
        },
        { status: 410 },
      );
    }
    const user = await client.query(
      "SELECT full_name, role FROM users WHERE email=$1 AND is_active FOR UPDATE",
      [email],
    );
    if (!user.rows[0]) {
      await client.query("ROLLBACK");
      return Response.json(
        { detail: "Account is not active." },
        { status: 403 },
      );
    }
    const id = randomUUID();
    const hash = await hashPassword(password);
    await client.query(
      'INSERT INTO "user" (id,email,name,full_name,role,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,$3,$4,true,now(),now())',
      [id, email, user.rows[0].full_name, user.rows[0].role],
    );
    await client.query(
      'INSERT INTO "account" (id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',
      [randomUUID(), id, hash],
    );
    await client.query(
      "UPDATE user_invitations SET used_at=now() WHERE token_hash=$1",
      [createHash("sha256").update(token).digest("hex")],
    );
    await client.query("COMMIT");
    return Response.json({ success: true });
  } catch {
    await client.query("ROLLBACK");
    return Response.json(
      {
        detail:
          "Could not accept invitation. If you already have an account, sign in or reset your password.",
      },
      { status: 409 },
    );
  } finally {
    client.release();
  }
}
