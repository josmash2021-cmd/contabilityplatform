import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool({
    host: 'ep-t4ni387b5e83b7519dc8.epsrv-t4n281l4mrmemi4zls9a.ap-southeast-1.privatelink.aliyuncs.com',
    port: 4000,
    user: '2zPnUYeQQ7X2Hv3.root',
    password: 'RYABLiImxNRTeN2GN107l3hBJMxMeL6l',
    database: '19e281d4-96a2-8847-8000-09ba1551d142',
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
