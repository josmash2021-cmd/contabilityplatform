import mysql from 'mysql2/promise';
if (!process.env.DATABASE_URL) { console.error("Define DATABASE_URL antes de correr este script."); process.exit(1); }

async function check() {
  try {
    const c = await mysql.createConnection({
      uri: process.env.DATABASE_URL
    });
    console.log('Connected!');
    const [rows] = await c.execute('SHOW TABLES');
    console.log('Tables:', rows);
    await c.end();
  } catch(e) {
    console.error('Error:', e.message);
  }
}

check();
