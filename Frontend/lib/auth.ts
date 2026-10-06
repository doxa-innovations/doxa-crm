import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { randomUUID } from "node:crypto";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { SignJWT, type JWTPayload } from "jose";
import { Pool } from "pg";

import { normalizeRole } from "@/lib/auth-types";

const fallbackDatabaseUrl =
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const fallbackSecret = "doxa-crm-local-development-secret";

// `next build` runs with NODE_ENV=production and imports route handlers, so this
// module is evaluated at build time when runtime secrets legitimately are not
// set. Fail fast at runtime only.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const mustFailFast = process.env.NODE_ENV === "production" && !isBuildPhase;

const requireEnv = (key: string, fallback: string): string => {
  const value = process.env[key];
  if (value && value.trim().length > 0) {
    return value;
  }
  if (mustFailFast) {
    throw new Error(`${key} must be set in production`);
  }
  return fallback;
};

// AUTH_DATABASE_URL wins when set (it may point at a different pooler than the
// backend uses); otherwise DATABASE_URL is required, and missing config is fatal
// in production rather than silently falling back.
const explicitAuthDatabaseUrl = process.env.AUTH_DATABASE_URL;
const databaseUrl = validatedAuthDatabaseUrl(
  explicitAuthDatabaseUrl && explicitAuthDatabaseUrl.trim().length > 0
    ? explicitAuthDatabaseUrl
    : requireEnv("DATABASE_URL", fallbackDatabaseUrl),
);
const betterAuthUrl = requireEnv("BETTER_AUTH_URL", "http://localhost:3000");
const backendAudience = process.env.NEXT_PUBLIC_API_URL || betterAuthUrl;
const betterAuthSecret = ((): string => {
  const explicit = process.env.BETTER_AUTH_SECRET;
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }
  const shared = process.env.SECRET_KEY;
  if (shared && shared.trim().length > 0) {
    return shared;
  }
  if (mustFailFast) {
    throw new Error(
      "BETTER_AUTH_SECRET (or SECRET_KEY) must be set in production",
    );
  }
  return fallbackSecret;
})();

const jwtSecret = new TextEncoder().encode(betterAuthSecret);
const defaultAuthPoolMax = 2;

declare global {
  var doxaAuthDatabasePool: Pool | undefined;
}

function authPoolMax(): number {
  const rawValue = process.env.BETTER_AUTH_DB_POOL_MAX;
  const parsedValue = rawValue ? Number(rawValue) : defaultAuthPoolMax;

  if (!Number.isFinite(parsedValue)) {
    return defaultAuthPoolMax;
  }

  return Math.min(Math.max(Math.trunc(parsedValue), 1), 10);
}

function normalizePgConnectionString(connectionString: string): string {
  try {
    const url = new URL(
      connectionString.replace("postgresql+asyncpg://", "postgresql://"),
    );
    url.searchParams.delete("ssl");
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    return url.toString();
  } catch {
    return connectionString;
  }
}

function validatedAuthDatabaseUrl(connectionString: string): string {
  try {
    const url = new URL(
      connectionString.replace("postgresql+asyncpg://", "postgresql://"),
    );

    if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
      throw new Error(
        "BetterAuth must use a normal Postgres URL, direct DB URL, or Supabase Session Pooler URL on port 5432. " +
          "Do not use the Supabase Transaction Pooler on port 6543 for auth login.",
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Transaction Pooler")
    ) {
      throw error;
    }
  }

  return connectionString;
}

function shouldUseSsl(connectionString: string): boolean {
  try {
    const url = new URL(
      connectionString.replace("postgresql+asyncpg://", "postgresql://"),
    );
    return Boolean(
      url.hostname.endsWith(".supabase.co") ||
      url.hostname.endsWith(".pooler.supabase.com"),
    );
  } catch {
    return false;
  }
}

function createAuthDatabasePool(): Pool {
  return new Pool({
    allowExitOnIdle: true,
    connectionString: normalizePgConnectionString(databaseUrl),
    connectionTimeoutMillis: 5000,
    keepAlive: true,
    idleTimeoutMillis: 10000,
    max: authPoolMax(),
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });
}

export const database =
  globalThis.doxaAuthDatabasePool ?? createAuthDatabasePool();
globalThis.doxaAuthDatabasePool = database;

function stringField(source: object, key: string): string | undefined {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function fastApiPayload(user: object): JWTPayload {
  const id = stringField(user, "id") ?? "";
  const email = stringField(user, "email") ?? "";
  const fullName =
    stringField(user, "full_name") ?? stringField(user, "name") ?? email;
  const role = normalizeRole(stringField(user, "role"));

  return {
    sub: id,
    id,
    email,
    full_name: fullName,
    role,
  };
}

const ssoAdmins = new Set(
  (process.env.CRM_SSO_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const auth = betterAuth({
  appName: "Doxa CRM",
  baseURL: betterAuthUrl,
  secret: betterAuthSecret,
  database,
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            mapProfileToUser: async (profile) => {
              const allowed = await database.query(
                "SELECT role FROM users WHERE lower(email) = lower($1) AND is_active",
                [profile.email],
              );
              if (
                !profile.email_verified ||
                (!ssoAdmins.has(profile.email.toLowerCase()) &&
                  !allowed.rows[0])
              ) {
                throw new APIError("FORBIDDEN", {
                  message:
                    "This Google account is not allowed to access the CRM.",
                });
              }
              return { full_name: profile.name };
            },
          },
        }
      : {},
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const allowed = await database.query(
            "SELECT role FROM users WHERE lower(email) = lower($1) AND is_active",
            [user.email],
          );
          if (
            !user.emailVerified ||
            (!ssoAdmins.has(user.email.toLowerCase()) && !allowed.rows[0])
          ) {
            throw new APIError("FORBIDDEN", {
              message: "Ask your administrator for CRM access.",
            });
          }
          return {
            data: {
              ...user,
              role: allowed.rows[0]?.role ?? "super_admin",
              full_name: user.name,
            },
          };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const result = await database.query(
            'SELECT email, name, role, "emailVerified" FROM "user" WHERE id = $1',
            [session.userId],
          );
          const user = result.rows[0];
          if (!user) return false;
          // Only verified, explicitly allowed Google administrators are provisioned.
          // Existing CRM users retain their database role and disabled state.
          if (user.emailVerified && ssoAdmins.has(user.email.toLowerCase())) {
            await database.query(
              `INSERT INTO users (id, email, full_name, role, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, 'super_admin', true, now(), now()) ON CONFLICT (email) DO NOTHING`,
              [randomUUID(), user.email.toLowerCase(), user.name],
            );
          }
          const crm = await database.query(
            "SELECT role, is_active FROM users WHERE lower(email) = lower($1)",
            [user.email],
          );
          if (!crm.rows[0]?.is_active)
            throw new APIError("FORBIDDEN", {
              message:
                "Your CRM account is not active. Contact your administrator.",
            });
          await database.query('UPDATE "user" SET role = $1 WHERE id = $2', [
            crm.rows[0].role,
            session.userId,
          ]);
          return { data: session };
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword:
      process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
        ? async ({ user, url }) => {
            const response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: process.env.RESEND_FROM_EMAIL,
                to: [user.email],
                subject: "Reset your Doxa CRM password",
                text: `Use this link within one hour to reset your password: ${url}\nIf you did not request this, ignore this message.`,
              }),
            });
            if (!response.ok)
              throw new APIError("SERVICE_UNAVAILABLE", {
                message:
                  "Recovery email could not be delivered. Please try again later.",
              });
          }
        : undefined,
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
      jwt: {
        issuer: betterAuthUrl,
        audience: backendAudience,
        expirationTime: "1h",
        definePayload: ({ user }) => fastApiPayload(user),
        sign: async (payload: JWTPayload) =>
          new SignJWT(payload)
            .setProtectedHeader({ alg: "HS256", typ: "JWT" })
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(jwtSecret),
      },
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
