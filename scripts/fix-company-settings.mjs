import mysql from 'mysql2/promise';

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (!dbUrl) {
    console.error('No DATABASE_URL or MYSQL_URL found');
    process.exit(1);
  }

  const pool = mysql.createPool(dbUrl);

  try {
    // Check if table exists
    const [tables] = await pool.query("SHOW TABLES LIKE 'companySettings'");
    if (tables.length === 0) {
      console.log('Table companySettings does not exist, creating...');
      await pool.execute(`
        CREATE TABLE companySettings (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          userId BIGINT UNSIGNED NOT NULL,
          companyName VARCHAR(255) DEFAULT 'Tu Placa',
          rif VARCHAR(50),
          address TEXT,
          phone VARCHAR(50),
          email VARCHAR(320),
          zelleEmail VARCHAR(320),
          bankName VARCHAR(100),
          bankAccountNumber VARCHAR(50),
          taxRate DECIMAL(5,2) DEFAULT '0.00',
          currency VARCHAR(10) DEFAULT 'USD',
          logo TEXT,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY companySettings_userId_idx (userId),
          CONSTRAINT companySettings_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log('Table companySettings created successfully');
    } else {
      console.log('Table companySettings exists, checking columns...');
      const [columns] = await pool.query('DESCRIBE companySettings');
      const columnNames = columns.map(c => c.Field);
      console.log('Existing columns:', columnNames.join(', '));

      // Check for missing columns
      const expectedColumns = [
        { name: 'taxRate', type: 'DECIMAL(5,2) DEFAULT "0.00"' },
        { name: 'currency', type: 'VARCHAR(10) DEFAULT "USD"' },
        { name: 'logo', type: 'TEXT' },
        { name: 'zelleEmail', type: 'VARCHAR(320)' },
        { name: 'bankName', type: 'VARCHAR(100)' },
        { name: 'bankAccountNumber', type: 'VARCHAR(50)' },
      ];

      for (const col of expectedColumns) {
        if (!columnNames.includes(col.name)) {
          console.log(`Adding missing column: ${col.name}`);
          await pool.execute(`ALTER TABLE companySettings ADD COLUMN ${col.name} ${col.type}`);
          console.log(`Column ${col.name} added`);
        }
      }
    }

    console.log('Done!');
  } catch (e) {
    console.error('Error:', e.message);
  }

  await pool.end();
}

main().catch(console.error);
