import "server-only";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Transactions require a Neon connection string.");
}

/** Runs dependent writes through a transaction-capable Neon driver. */
const transactionDb = drizzle(new Pool({ connectionString: databaseUrl }), { schema });
type Transaction = Parameters<typeof transactionDb.transaction>[0] extends (tx: infer T) => Promise<unknown> ? T : never;

/** Transaction handle shared by lib services that run inside withDbTransaction. */
export type DbTransaction = Transaction;

export async function withDbTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
  return transactionDb.transaction(callback);
}
