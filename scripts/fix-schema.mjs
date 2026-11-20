import mysql from 'mysql2/promise';
if (!process.env.DATABASE_URL) { console.error("Define DATABASE_URL antes de correr este script."); process.exit(1); }

async function main() {
  // Use Railway public proxy
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL
  });

  try {
    console.log('Checking companySettings table...');
    const [columns] = await pool.query('DESCRIBE companySettings');
    const columnNames = columns.map(c => c.Field);
    console.log('Existing columns:', columnNames.join(', '));

    // Add missing columns to match Drizzle schema
    const migrations = [
      { name: 'rif', sql: 'ALTER TABLE companySettings ADD COLUMN rif VARCHAR(50)' },
      { name: 'taxRate', sql: 'ALTER TABLE companySettings ADD COLUMN taxRate DECIMAL(5,2) DEFAULT "0.00"' },
      { name: 'zelleEmail', sql: 'ALTER TABLE companySettings ADD COLUMN zelleEmail VARCHAR(320)' },
      { name: 'bankName', sql: 'ALTER TABLE companySettings ADD COLUMN bankName VARCHAR(100)' },
      { name: 'bankAccountNumber', sql: 'ALTER TABLE companySettings ADD COLUMN bankAccountNumber VARCHAR(50)' },
      { name: 'currency', sql: 'ALTER TABLE companySettings ADD COLUMN currency VARCHAR(10) DEFAULT "USD"' },
      { name: 'updatedAt', sql: 'ALTER TABLE companySettings ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
    ];

    for (const mig of migrations) {
      if (!columnNames.includes(mig.name)) {
        try {
          await pool.execute(mig.sql);
          console.log(`✓ Added column: ${mig.name}`);
        } catch (e) {
          console.error(`✗ Failed to add ${mig.name}:`, e.message);
        }
      } else {
        console.log(`✓ Column already exists: ${mig.name}`);
      }
    }

    console.log('\nDone!');
  } catch (e) {
    console.error('Error:', e.message);
  }

  await pool.end();
}

main().catch(console.error);
