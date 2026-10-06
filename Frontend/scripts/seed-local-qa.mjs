// Only for disposable local/CI databases. Never loads repository environment files.
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
const connectionString = process.env.AUTH_DATABASE_URL;
if (
  !connectionString ||
  !["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname) ||
  process.env.NODE_ENV === "production"
)
  throw new Error("QA seed requires a non-production localhost database");
const pool = new Pool({ connectionString });
const hash = await hashPassword("DoxaDemo123!");
try {
  const users = await pool.query(
    "SELECT email,full_name,role FROM users WHERE email LIKE '%@doxa.local'",
  );
  for (const user of users.rows) {
    const exists = await pool.query('SELECT id FROM "user" WHERE email=$1', [
      user.email,
    ]);
    if (exists.rows.length) continue;
    const id = randomUUID();
    await pool.query(
      'INSERT INTO "user"(id,email,name,full_name,role,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,$3,$4,true,now(),now())',
      [id, user.email, user.full_name, user.role],
    );
    await pool.query(
      'INSERT INTO "account"(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',
      [randomUUID(), id, hash],
    );
  }
  console.log("Local QA identities ready.");
} finally {
  await pool.end();
}
