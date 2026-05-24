import mysql from 'mysql2/promise';

async function fix() {
  const c = await mysql.createConnection({
    host: 'autorack.proxy.rlwy.net',
    port: 25778,
    user: 'root',
    password: 'chLSOgeGMqHDzbtLNNovdLhggsGMmzLw',
    database: 'railway'
  });
  console.log('Connected!');
  await c.execute('ALTER TABLE users ADD COLUMN lastSignInAt timestamp NULL');
  console.log('Column lastSignInAt added!');
  await c.end();
}

fix().catch(e => console.error('Error:', e.message));
