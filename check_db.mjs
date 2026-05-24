import mysql from 'mysql2/promise';

async function check() {
  try {
    const c = await mysql.createConnection({
      host: 'autorack.proxy.rlwy.net',
      port: 25778,
      user: 'root',
      password: 'chLSOgeGMqHDzbtLNNovdLhggsGMmzLw',
      database: 'railway'
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
