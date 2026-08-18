import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { betterAuth } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { jwt } from "better-auth/plugins";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

const FORBIDDEN_PASSWORDS = new Set(["DoxaDemo123!"]);
const MIN_PASSWORD_LENGTH = 12;

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  let file;
  try {
    file = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of file.split(/\r?\n/)) {
    const cleanLine = line.trim();
    if (!cleanLine || cleanLine.startsWith("#") || !cleanLine.includes("=")) {
      continue;
    }
    const separatorIndex = cleanLine.indexOf("=");
    const key = cleanLine.slice(0, separatorIndex).trim();
    const value = cleanLine.slice(separatorIndex + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function normalizePgConnectionString(connectionString) {
  const url = new URL(connectionString.replace("postgresql+asyncpg://", "postgresql://"));
  url.searchParams.delete("ssl");
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  return url.toString();
}

function shouldUseSsl(connectionString) {
  try {
    const url = new URL(connectionString.replace("postgresql+asyncpg://", "postgresql://"));
    return url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".pooler.supabase.com");
  } catch {
    return false;
  }
}

function createPool(connectionString) {
  return new Pool({
    allowExitOnIdle: true,
    connectionString: normalizePgConnectionString(connectionString),
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
}

function validatePassword(password) {
  if (FORBIDDEN_PASSWORDS.has(password)) {
    throw new Error("ADMIN_PASSWORD is the published demo password and must not be used");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

async function main() {
  loadEnv();

  const email = requiredEnv("ADMIN_EMAIL").toLowerCase();
  const password = requiredEnv("ADMIN_PASSWORD");

  // Validate before requiring anything else, so a weak or published password is
  // rejected on its own merits rather than masked by unrelated missing config.
  validatePassword(password);

  const fullName = process.env.ADMIN_FULL_NAME?.trim() || email;
  const connectionString = requiredEnv("DATABASE_URL");
  const betterAuthUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const secret = requiredEnv("BETTER_AUTH_SECRET");

  const pool = createPool(connectionString);
  const kysely = new Kysely({ dialect: new PostgresDialect({ pool: createPool(connectionString) }) });

  try {
    const existing = await pool.query('select id from "user" where email = $1', [email]);
    if (existing.rows[0]?.id) {
      throw new Error(`An account already exists for ${email}; refusing to overwrite it`);
    }

    const auth = betterAuth({
      appName: "Doxa CRM",
      baseURL: betterAuthUrl,
      secret,
      database: { db: kysely, type: "postgres" },
      emailAndPassword: { enabled: true, requireEmailVerification: false },
      user: {
        additionalFields: {
          full_name: { type: "string", required: false, defaultValue: "" },
          role: { type: "string", required: false, defaultValue: "sales_rep", input: false },
        },
      },
      plugins: [jwt({ jwks: { remoteUrl: `${betterAuthUrl}/api/auth/jwks`, keyPairConfig: { alg: "EdDSA" } } })],
    });

    await auth.api.signUpEmail({
      body: { email, name: fullName, full_name: fullName, password, rememberMe: false },
    });

    const created = await pool.query('select id from "user" where email = $1', [email]);
    const userId = created.rows[0]?.id;
    if (!userId) {
      throw new Error(`BetterAuth did not create a user for ${email}`);
    }

    await pool.query(
      'update "user" set name = $1, full_name = $1, role = $2, "emailVerified" = true, "updatedAt" = now() where id = $3',
      [fullName, "super_admin", userId],
    );

    const hashedPassword = await hashPassword(password);
    const account = await pool.query(
      'select id from "account" where "userId" = $1 and "providerId" = $2',
      [userId, "credential"],
    );
    if (account.rows[0]?.id) {
      await pool.query('update "account" set password = $1, "updatedAt" = now() where id = $2', [
        hashedPassword,
        account.rows[0].id,
      ]);
    } else {
      await pool.query(
        'insert into "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, now(), now())',
        [randomUUID(), userId, "credential", userId, hashedPassword],
      );
    }

    // The CRM users table is separate from BetterAuth's; the API resolves the
    // token subject against it and 401s if the row is missing.
    await pool.query(
      `insert into users (id, email, full_name, role, is_active, created_at, updated_at)
       values ($1, $2, $3, $4::user_role, true, now(), now())
       on conflict (email) do update set role = excluded.role, full_name = excluded.full_name, is_active = true, updated_at = now()`,
      [randomUUID(), email, fullName, "super_admin"],
    );

    console.log(`Created super_admin: ${email}`);
  } finally {
    await pool.end().catch(() => undefined);
    await kysely.destroy().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
