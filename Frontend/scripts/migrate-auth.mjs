import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { jwt } from "better-auth/plugins";

const connectionString = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString || !process.env.BETTER_AUTH_SECRET) throw new Error("Database URL and BETTER_AUTH_SECRET are required");
const database = new Pool({ connectionString, max: 1 });
try {
  const migrations = await getMigrations({
    database,
    secret: process.env.BETTER_AUTH_SECRET,
    user: { additionalFields: {
      full_name: { type: "string", required: false, defaultValue: "" },
      role: { type: "string", required: false, defaultValue: "sales_rep", input: false },
    } },
    plugins: [jwt()],
  });
  await migrations.runMigrations();
  console.log("BetterAuth schema is ready; no users seeded.");
} finally { await database.end(); }
