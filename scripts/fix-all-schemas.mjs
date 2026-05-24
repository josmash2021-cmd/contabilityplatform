import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool({
    host: 'autorack.proxy.rlwy.net',
    port: 25778,
    user: 'root',
    password: 'chLSOgeGMqHDzbtLNNovdLhggsGMmzLw',
    database: 'railway'
  });

  const fixes = [
    // bankAccounts fixes
    {
      table: 'bankAccounts',
      columns: [
        { name: 'bankName', sql: 'ALTER TABLE bankAccounts ADD COLUMN bankName VARCHAR(100)' },
        { name: 'currentBalance', sql: 'ALTER TABLE bankAccounts ADD COLUMN currentBalance DECIMAL(14,2) DEFAULT "0"' },
        { name: 'isActive', sql: 'ALTER TABLE bankAccounts ADD COLUMN isActive TINYINT(1) DEFAULT 1' },
        { name: 'connectedAt', sql: 'ALTER TABLE bankAccounts ADD COLUMN connectedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updatedAt', sql: 'ALTER TABLE bankAccounts ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      ]
    },
    // Add more tables here as needed
  ];

  for (const fix of fixes) {
    console.log(`\nChecking ${fix.table}...`);
    try {
      const [columns] = await pool.query(`DESCRIBE ${fix.table}`);
      const columnNames = columns.map(c => c.Field);
      
      for (const col of fix.columns) {
        if (!columnNames.includes(col.name)) {
          try {
            await pool.execute(col.sql);
            console.log(`  ✓ Added column: ${col.name}`);
          } catch (e) {
            console.error(`  ✗ Failed to add ${col.name}:`, e.message);
          }
        } else {
          console.log(`  ✓ Column exists: ${col.name}`);
        }
      }
    } catch (e) {
      console.error(`  ✗ Error checking ${fix.table}:`, e.message);
    }
  }

  console.log('\nDone!');
  await pool.end();
}

main().catch(console.error);
