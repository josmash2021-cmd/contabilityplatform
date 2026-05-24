import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: any;

// Use Railway's internal MySQL URL if available, fallback to DATABASE_URL
const dbUrl = process.env.MYSQL_URL || env.databaseUrl;

export function getDb() {
  if (!instance) {
    const pool = mysql.createPool({
      uri: dbUrl,
      connectionLimit: 10,
    });
    instance = drizzle(pool, {
      mode: "default",
      schema: fullSchema,
    });
  }
  return instance;
}
