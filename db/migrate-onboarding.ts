import { getDb } from "./index";
import { sql } from "drizzle-orm";

async function migrate() {
  const db = getDb();
  console.log("[migrate] Adding onboarding columns to companySettings...");

  const columns = [
    { name: "addressType", type: "varchar(50)" },
    { name: "city", type: "varchar(100)" },
    { name: "state", type: "varchar(100)" },
    { name: "zipCode", type: "varchar(20)" },
  ];

  for (const col of columns) {
    try {
      await db.execute(sql.raw(`ALTER TABLE companySettings ADD COLUMN ${col.name} ${col.type}`));
      console.log(`[migrate] Added column: ${col.name}`);
    } catch (err: any) {
      if (err.message?.includes("Duplicate column")) {
        console.log(`[migrate] Column ${col.name} already exists`);
      } else {
        console.error(`[migrate] Error adding ${col.name}:`, err.message);
      }
    }
  }

  console.log("[migrate] Done!");
}

migrate().catch(console.error);
