import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { betterAuth } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { getMigrations } from "better-auth/db/migration";
import { jwt } from "better-auth/plugins";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

const DEMO_PASSWORD = "DoxaDemo123!";

const demoUsers = [
  ["admin@doxa.local", "Amina Reed", "super_admin"],
  ["sales.manager@doxa.local", "Priya Shah", "sales_manager"],
  ["alex.rep@doxa.local", "Alex Morgan", "sales_rep"],
  ["maya.rep@doxa.local", "Maya Chen", "sales_rep"],
  ["marketing.manager@doxa.local", "Noah Reed", "marketing_manager"],
  ["marketing.rep@doxa.local", "Zoe Park", "marketing_rep"],
  ["success@doxa.local", "Lina Gomez", "customer_success"],
  ["readonly@doxa.local", "Omar Ali", "read_only"],
];

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  const file = readFileSync(envPath, "utf8");

  for (const line of file.split(/\r?\n/)) {
    const cleanLine = line.trim();
    if (!cleanLine || cleanLine.startsWith("#") || !cleanLine.includes("=")) {
      continue;
    }

    const separatorIndex = cleanLine.indexOf("=");
    const key = cleanLine.slice(0, separatorIndex).trim();
    const value = cleanLine.slice(separatorIndex + 1).trim();
    process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required in Frontend/.env`);
  }
  return value;
}

function authDatabaseUrl() {
  const value = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL;
  if (!value || value.trim().length === 0) {
    throw new Error("AUTH_DATABASE_URL or DATABASE_URL is required in Frontend/.env");
  }

  validateAuthDatabaseUrl(value);
  return value;
}

function validateAuthDatabaseUrl(connectionString) {
  const url = new URL(connectionString.replace("postgresql+asyncpg://", "postgresql://"));

  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    throw new Error(
      "BetterAuth seed data must use a normal Postgres URL, direct DB URL, or Supabase Session Pooler URL on port 5432. " +
        "Do not use the Supabase Transaction Pooler on port 6543 for auth login.",
    );
  }
}

function normalizePgConnectionString(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete("ssl");
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  return url.toString();
}

function createPool(connectionString) {
  return new Pool({
    allowExitOnIdle: true,
    connectionString: normalizePgConnectionString(connectionString),
    ssl: { rejectUnauthorized: false },
  });
}

function createAuthConfig(database) {
  const betterAuthUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";

  return {
    appName: "Doxa CRM",
    baseURL: betterAuthUrl,
    secret: requiredEnv("BETTER_AUTH_SECRET"),
    database,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    user: {
      additionalFields: {
        full_name: {
          type: "string",
          required: false,
          defaultValue: "",
        },
        role: {
          type: "string",
          required: false,
          defaultValue: "sales_rep",
          input: false,
        },
      },
    },
    plugins: [
      jwt({
        jwks: {
          remoteUrl: `${betterAuthUrl}/api/auth/jwks`,
          keyPairConfig: {
            alg: "EdDSA",
          },
        },
      }),
    ],
  };
}

async function ensurePassword(pool, email, fullName, role) {
  const hashedPassword = await hashPassword(DEMO_PASSWORD);
  const userResult = await pool.query('select id from "user" where email = $1', [email]);
  const userId = userResult.rows[0]?.id;

  if (!userId) {
    throw new Error(`BetterAuth user was not created for ${email}`);
  }

  await pool.query(
    'update "user" set name = $1, full_name = $1, role = $2, "emailVerified" = true, "updatedAt" = now() where id = $3',
    [fullName, role, userId],
  );

  const accountResult = await pool.query(
    'select id from "account" where "userId" = $1 and "providerId" = $2',
    [userId, "credential"],
  );

  if (accountResult.rows[0]?.id) {
    await pool.query(
      'update "account" set password = $1, "accountId" = $2, "updatedAt" = now() where id = $3',
      [hashedPassword, userId, accountResult.rows[0].id],
    );
    return;
  }

  await pool.query(
    'insert into "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, now(), now())',
    [randomUUID(), userId, "credential", userId, hashedPassword],
  );
}

async function main() {
  loadEnv();
  const connectionString = authDatabaseUrl();
  const migrationPool = createPool(connectionString);
  const kysely = new Kysely({
    dialect: new PostgresDialect({ pool: migrationPool }),
  });

  const authConfig = createAuthConfig({
    db: kysely,
    type: "postgres",
  });
  const auth = betterAuth(authConfig);
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();

  const writePool = createPool(connectionString);
  try {
    for (const [email, fullName, role] of demoUsers) {
      try {
        await auth.api.signUpEmail({
          body: {
            email,
            name: fullName,
            full_name: fullName,
            password: DEMO_PASSWORD,
            rememberMe: false,
          },
        });
        console.log(`Created auth user: ${email}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.toLowerCase().includes("user already exists")) {
          console.log(`Auth user exists or could not sign up directly: ${email}`);
        }
      }

      await ensurePassword(writePool, email, fullName, role);
      console.log(`Ready login: ${email}`);
    }
  } finally {
    await writePool.end();
    await kysely.destroy();
    await migrationPool.end().catch(() => undefined);
  }

  console.log("");
  console.log(`Demo password for all users: ${DEMO_PASSWORD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
