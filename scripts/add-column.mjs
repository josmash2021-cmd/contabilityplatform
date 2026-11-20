import mysql from 'mysql2/promise';
if (!process.env.DATABASE_URL) { console.error("Define DATABASE_URL antes de correr este script."); process.exit(1); }

async function main() {
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
  });

  try {
    await pool.execute('ALTER TABLE bankTransactions ADD COLUMN plaidAmount DECIMAL(12,2)');
    console.log('SUCCESS: Column plaidAmount added to bankTransactions');
  } catch (e) {
    if (e.message && (e.message.includes('Duplicate column') || e.message.includes('already exists'))) {
      console.log('Column already exists');
    } else {
      console.error('Error:', e.message);
    }
  }

  await pool.end();
}

main().catch(console.error);
