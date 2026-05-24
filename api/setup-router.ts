import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export const setupRouter = createRouter({
  run: publicQuery.mutation(async () => {
    const db = getDb();
    const results: string[] = [];

    try {
      // 1. Add hasPersonalMode to users table
      try {
        await db.execute(sql`ALTER TABLE users ADD COLUMN hasPersonalMode BOOLEAN DEFAULT FALSE`);
        results.push("Added hasPersonalMode to users");
      } catch (e: any) {
        if (e.message?.includes("Duplicate column") || e.message?.includes("already exists")) {
          results.push("hasPersonalMode already exists");
        } else {
          results.push(`Error adding hasPersonalMode: ${e.message}`);
        }
      }

      // 2. Add modePreference to users table
      try {
        await db.execute(sql`ALTER TABLE users ADD COLUMN modePreference ENUM('business', 'personal') DEFAULT 'business'`);
        results.push("Added modePreference to users");
      } catch (e: any) {
        if (e.message?.includes("Duplicate column") || e.message?.includes("already exists")) {
          results.push("modePreference already exists");
        } else {
          results.push(`Error adding modePreference: ${e.message}`);
        }
      }

      // 3. Create personalTransactions table
      try {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS personalTransactions (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            userId BIGINT UNSIGNED NOT NULL,
            description VARCHAR(255) NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            type ENUM('income', 'expense') NOT NULL,
            category VARCHAR(50) NOT NULL DEFAULT 'other',
            paymentMethod ENUM('cash', 'card', 'transfer', 'zelle', 'other') DEFAULT 'cash' NOT NULL,
            transactionDate DATE NOT NULL,
            notes TEXT,
            isRecurring BOOLEAN DEFAULT FALSE,
            recurringFrequency ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'),
            createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
            INDEX personalTx_userId_idx (userId),
            INDEX personalTx_date_idx (transactionDate),
            INDEX personalTx_type_idx (type)
          )
        `);
        results.push("Created personalTransactions table");
      } catch (e: any) {
        results.push(`Error creating personalTransactions: ${e.message}`);
      }

      // 4. Create personalCategories table
      try {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS personalCategories (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            userId BIGINT UNSIGNED NOT NULL,
            name VARCHAR(50) NOT NULL,
            type ENUM('income', 'expense') NOT NULL,
            color VARCHAR(7) DEFAULT '#000000',
            icon VARCHAR(30) DEFAULT 'circle',
            budgetLimit DECIMAL(12,2),
            isDefault BOOLEAN DEFAULT FALSE,
            createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
            UNIQUE INDEX personalCat_user_name_idx (userId, name)
          )
        `);
        results.push("Created personalCategories table");
      } catch (e: any) {
        results.push(`Error creating personalCategories: ${e.message}`);
      }

      // 5. Create personalGoals table
      try {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS personalGoals (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            userId BIGINT UNSIGNED NOT NULL,
            name VARCHAR(100) NOT NULL,
            targetAmount DECIMAL(12,2) NOT NULL,
            currentAmount DECIMAL(12,2) DEFAULT 0 NOT NULL,
            deadline DATE,
            category VARCHAR(50) DEFAULT 'savings',
            isActive BOOLEAN DEFAULT TRUE,
            createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
            INDEX personalGoal_userId_idx (userId)
          )
        `);
        results.push("Created personalGoals table");
      } catch (e: any) {
        results.push(`Error creating personalGoals: ${e.message}`);
      }

      // 6. Set all existing users to BUSINESS mode (they registered before personal existed)
      try {
        await db.execute(sql`UPDATE users SET modePreference = 'business', hasPersonalMode = false WHERE modePreference IS NULL`);
        results.push("Set all existing users to NEGOCIO mode");
      } catch (e: any) {
        results.push(`Error setting business mode: ${e.message}`);
      }

      return { success: true, results };
    } catch (err: any) {
      return { success: false, error: err.message || "Unknown error", results };
    }
  }),
});
