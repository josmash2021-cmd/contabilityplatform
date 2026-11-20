import mysql from 'mysql2/promise';
if (!process.env.DATABASE_URL) { console.error("Define DATABASE_URL antes de correr este script."); process.exit(1); }

async function fix() {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL
  });
  console.log('Connected!');
  await c.execute('ALTER TABLE users ADD COLUMN lastSignInAt timestamp NULL');
  console.log('Column lastSignInAt added!');
  await c.end();
}

fix().catch(e => console.error('Error:', e.message));
