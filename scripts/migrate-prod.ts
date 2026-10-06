import { readFileSync } from "node:fs";
import { Client } from "pg";

const url = (process.env.NEON_URL ?? "")
  .replace("?sslmode=require", "")
  .replace("?channel_binding=require", "");

const sql = readFileSync("drizzle/0005_wonderful_jackpot.sql", "utf8");
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

async function main() {
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  for (const s of statements) {
    await client.query(s);
  }
  console.log("ok");
  const e = await client.query(
    "select enumlabel from pg_enum en join pg_type t on t.oid=en.enumtypid where t.typname='reservation_status' order by en.enumsortorder",
  );
  console.log(e.rows.map((r) => r.enumlabel));
  const r = await client.query(
    "select status, count(*)::int n, count(*) filter (where is_no_show<>0)::int no_show from reservations group by status order by status",
  );
  console.table(r.rows);
  await client.end();
}

main().catch((err) => {
  console.error("ERR", err.message);
  process.exit(1);
});
