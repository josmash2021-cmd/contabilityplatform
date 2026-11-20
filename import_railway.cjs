const mysql = require('mysql2/promise');
const fs = require('fs');
if (!process.env.DATABASE_URL) { console.error("Define DATABASE_URL antes de correr este script."); process.exit(1); }

async function run() {
  console.log('Conectando a Railway MySQL...');
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL
  });
  console.log('Conectado!');
  
  const sql = fs.readFileSync('schema_railway.sql', 'utf8');
  const stmts = sql.split(';').filter(s => s.trim());
  
  let ok = 0, fail = 0;
  for (const s of stmts) {
    try {
      await c.execute(s + ';');
      ok++;
    } catch(e) {
      fail++;
      console.log('ERR:', e.message.substring(0, 120));
      console.log('SQL:', s.substring(0, 80));
    }
  }
  
  console.log('OK:', ok, 'FAIL:', fail);
  await c.end();
}

run().catch(console.error);
