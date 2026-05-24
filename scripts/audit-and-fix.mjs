import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool({
    host: 'autorack.proxy.rlwy.net',
    port: 25778,
    user: 'root',
    password: 'chLSOgeGMqHDzbtLNNovdLhggsGMmzLw',
    database: 'railway'
  });

  console.log('=== AUDIT AND FIX DATABASE SCHEMA ===\n');

  // Helper to check if column exists
  async function colExists(table, col) {
    const [cols] = await pool.query('DESCRIBE ' + table);
    return cols.some(c => c.Field === col);
  }

  // Helper to run SQL safely
  async function run(sql, desc) {
    try {
      await pool.execute(sql);
      console.log('  ✓', desc);
      return true;
    } catch(e) {
      if (e.message.includes('Duplicate') || e.message.includes('already exists')) {
        console.log('  ⚠', desc, '- already exists');
        return true;
      }
      console.log('  ✗', desc, '-', e.message.substring(0, 80));
      return false;
    }
  }

  // ========== USERS ==========
  console.log('\n--- users ---');
  await run('ALTER TABLE users MODIFY COLUMN role VARCHAR(50) DEFAULT "user" NOT NULL', 'Fix role default');
  await run('ALTER TABLE users MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');
  await run('ALTER TABLE users MODIFY COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL', 'Fix updatedAt');
  await run('ALTER TABLE users MODIFY COLUMN lastSignInAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix lastSignInAt');

  // ========== SERVICES ==========
  console.log('\n--- services ---');
  await run('ALTER TABLE services MODIFY COLUMN name VARCHAR(255) NOT NULL', 'Fix name NOT NULL');
  await run('ALTER TABLE services MODIFY COLUMN price DECIMAL(10,2) NOT NULL', 'Fix price NOT NULL');
  await run('ALTER TABLE services MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');
  await run('ALTER TABLE services MODIFY COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL', 'Fix updatedAt');
  if (await colExists('services', 'createdBy')) {
    await run('ALTER TABLE services DROP COLUMN createdBy', 'Drop createdBy');
  }

  // ========== CUSTOMERS ==========
  console.log('\n--- customers ---');
  await run('ALTER TABLE customers MODIFY COLUMN name VARCHAR(255) NOT NULL', 'Fix name NOT NULL');
  await run('ALTER TABLE customers MODIFY COLUMN clientType ENUM("placas","titulos") DEFAULT "placas" NOT NULL', 'Fix clientType');
  await run('ALTER TABLE customers MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');
  await run('ALTER TABLE customers MODIFY COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL', 'Fix updatedAt');
  if (await colExists('customers', 'createdBy')) {
    await run('ALTER TABLE customers DROP COLUMN createdBy', 'Drop createdBy');
  }

  // ========== SALES ==========
  console.log('\n--- sales ---');
  await run('ALTER TABLE sales MODIFY COLUMN invoiceNumber VARCHAR(50) NOT NULL', 'Fix invoiceNumber');
  await run('ALTER TABLE sales MODIFY COLUMN subtotal DECIMAL(12,2) NOT NULL', 'Fix subtotal');
  await run('ALTER TABLE sales MODIFY COLUMN total DECIMAL(12,2) NOT NULL', 'Fix total');
  await run('ALTER TABLE sales MODIFY COLUMN paymentMethod ENUM("cash","zelle","card","mixed") NOT NULL', 'Fix paymentMethod');
  await run('ALTER TABLE sales MODIFY COLUMN status ENUM("completed","pending","cancelled","refunded") DEFAULT "completed" NOT NULL', 'Fix status');
  await run('ALTER TABLE sales MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');
  await run('ALTER TABLE sales MODIFY COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL', 'Fix updatedAt');

  // ========== SALE SERVICES ==========
  console.log('\n--- saleServices ---');
  await run('ALTER TABLE saleServices MODIFY COLUMN serviceName VARCHAR(255) NOT NULL', 'Fix serviceName');
  await run('ALTER TABLE saleServices MODIFY COLUMN quantity INT NOT NULL', 'Fix quantity');
  await run('ALTER TABLE saleServices MODIFY COLUMN unitPrice DECIMAL(10,2) NOT NULL', 'Fix unitPrice');
  await run('ALTER TABLE saleServices MODIFY COLUMN total DECIMAL(10,2) NOT NULL', 'Fix total');
  await run('ALTER TABLE saleServices MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');

  // ========== PAYMENT RECORDS ==========
  console.log('\n--- paymentRecords ---');
  await run('ALTER TABLE paymentRecords MODIFY COLUMN saleId BIGINT UNSIGNED', 'Fix saleId nullable');
  await run('ALTER TABLE paymentRecords MODIFY COLUMN amount DECIMAL(12,2) NOT NULL', 'Fix amount');
  await run('ALTER TABLE paymentRecords MODIFY COLUMN method ENUM("cash","zelle","card") NOT NULL', 'Fix method');
  await run('ALTER TABLE paymentRecords MODIFY COLUMN status ENUM("completed","pending","failed","refunded") DEFAULT "completed" NOT NULL', 'Fix status');
  await run('ALTER TABLE paymentRecords MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');

  // ========== ACCOUNTS ==========
  console.log('\n--- accounts ---');
  await run('ALTER TABLE accounts MODIFY COLUMN code VARCHAR(20) NOT NULL', 'Fix code');
  await run('ALTER TABLE accounts MODIFY COLUMN name VARCHAR(255) NOT NULL', 'Fix name');
  await run('ALTER TABLE accounts MODIFY COLUMN type ENUM("asset","liability","equity","revenue","expense") NOT NULL', 'Fix type');
  await run('ALTER TABLE accounts MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');
  if (await colExists('accounts', 'updatedAt')) {
    await run('ALTER TABLE accounts DROP COLUMN updatedAt', 'Drop updatedAt');
  }
  if (await colExists('accounts', 'createdBy')) {
    await run('ALTER TABLE accounts DROP COLUMN createdBy', 'Drop createdBy');
  }

  // ========== JOURNAL ENTRIES ==========
  console.log('\n--- journalEntries ---');
  await run('ALTER TABLE journalEntries MODIFY COLUMN entryNumber VARCHAR(50) NOT NULL', 'Fix entryNumber');
  await run('ALTER TABLE journalEntries MODIFY COLUMN date DATE NOT NULL', 'Fix date');
  await run('ALTER TABLE journalEntries MODIFY COLUMN description TEXT NOT NULL', 'Fix description');
  await run('ALTER TABLE journalEntries MODIFY COLUMN debitTotal DECIMAL(14,2) NOT NULL', 'Fix debitTotal');
  await run('ALTER TABLE journalEntries MODIFY COLUMN creditTotal DECIMAL(14,2) NOT NULL', 'Fix creditTotal');
  await run('ALTER TABLE journalEntries MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');

  // ========== JOURNAL ENTRY LINES ==========
  console.log('\n--- journalEntryLines ---');
  if (await colExists('journalEntryLines', 'createdAt')) {
    await run('ALTER TABLE journalEntryLines DROP COLUMN createdAt', 'Drop createdAt');
  }

  // ========== PERIOD CLOSURES ==========
  console.log('\n--- periodClosures ---');
  await run('ALTER TABLE periodClosures MODIFY COLUMN closedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix closedAt');
  await run('ALTER TABLE periodClosures MODIFY COLUMN closedBy BIGINT UNSIGNED NOT NULL', 'Fix closedBy');
  if (await colExists('periodClosures', 'notes')) {
    await run('ALTER TABLE periodClosures DROP COLUMN notes', 'Drop notes');
  }
  if (await colExists('periodClosures', 'createdAt')) {
    await run('ALTER TABLE periodClosures DROP COLUMN createdAt', 'Drop createdAt');
  }
  if (await colExists('periodClosures', 'updatedAt')) {
    await run('ALTER TABLE periodClosures DROP COLUMN updatedAt', 'Drop updatedAt');
  }

  // ========== EXPENSES ==========
  console.log('\n--- expenses ---');
  await run('ALTER TABLE expenses MODIFY COLUMN description VARCHAR(255) NOT NULL', 'Fix description');
  await run('ALTER TABLE expenses MODIFY COLUMN category VARCHAR(100) NOT NULL', 'Fix category');
  await run('ALTER TABLE expenses MODIFY COLUMN paymentMethod ENUM("cash","zelle","card") NOT NULL', 'Fix paymentMethod');
  await run('ALTER TABLE expenses MODIFY COLUMN date DATE NOT NULL', 'Fix date');
  await run('ALTER TABLE expenses MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');

  // ========== BANK ACCOUNTS ==========
  console.log('\n--- bankAccounts ---');
  await run('ALTER TABLE bankAccounts MODIFY COLUMN bankName VARCHAR(100) NOT NULL', 'Fix bankName');
  await run('ALTER TABLE bankAccounts MODIFY COLUMN connectedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix connectedAt');
  await run('ALTER TABLE bankAccounts MODIFY COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL', 'Fix updatedAt');

  // ========== BANK TRANSACTIONS ==========
  console.log('\n--- bankTransactions ---');
  await run('ALTER TABLE bankTransactions MODIFY COLUMN transactionDate DATE NOT NULL', 'Fix transactionDate');
  await run('ALTER TABLE bankTransactions MODIFY COLUMN description VARCHAR(255) NOT NULL', 'Fix description');
  await run('ALTER TABLE bankTransactions MODIFY COLUMN amount DECIMAL(12,2) NOT NULL', 'Fix amount');
  await run('ALTER TABLE bankTransactions MODIFY COLUMN type ENUM("income","expense") NOT NULL', 'Fix type');
  await run('ALTER TABLE bankTransactions MODIFY COLUMN category ENUM("business_expense","home_expense","shopping","subscription","zelle_income","cash_income","transfer","other","zelle_sent","cash_withdrawal","deposit","cash_deposit") DEFAULT "other" NOT NULL', 'Fix category');
  await run('ALTER TABLE bankTransactions MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');
  if (await colExists('bankTransactions', 'status')) {
    await run('ALTER TABLE bankTransactions DROP COLUMN status', 'Drop status');
  }
  if (await colExists('bankTransactions', 'currency')) {
    await run('ALTER TABLE bankTransactions DROP COLUMN currency', 'Drop currency');
  }

  // ========== SUBSCRIPTIONS ==========
  console.log('\n--- subscriptions ---');
  await run('ALTER TABLE subscriptions MODIFY COLUMN plan ENUM("monthly","annual") NOT NULL', 'Fix plan');
  await run('ALTER TABLE subscriptions MODIFY COLUMN status ENUM("active","cancelled","past_due","unpaid","trialing") DEFAULT "active" NOT NULL', 'Fix status');
  await run('ALTER TABLE subscriptions MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');
  await run('ALTER TABLE subscriptions MODIFY COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL', 'Fix updatedAt');
  if (await colExists('subscriptions', 'cancelAtPeriodEnd')) {
    // Keep it but ensure boolean
  }

  // ========== SUBSCRIPTION PAYMENTS ==========
  console.log('\n--- subscriptionPayments ---');
  await run('ALTER TABLE subscriptionPayments MODIFY COLUMN amount DECIMAL(10,2) NOT NULL', 'Fix amount');
  await run('ALTER TABLE subscriptionPayments MODIFY COLUMN plan ENUM("monthly","annual") NOT NULL', 'Fix plan');
  await run('ALTER TABLE subscriptionPayments MODIFY COLUMN status ENUM("succeeded","pending","failed") DEFAULT "pending" NOT NULL', 'Fix status');
  if (await colExists('subscriptionPayments', 'paidAt')) {
    await run('ALTER TABLE subscriptionPayments MODIFY COLUMN paidAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix paidAt');
  } else {
    await run('ALTER TABLE subscriptionPayments ADD COLUMN paidAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Add paidAt');
  }
  if (await colExists('subscriptionPayments', 'currency')) {
    await run('ALTER TABLE subscriptionPayments DROP COLUMN currency', 'Drop currency');
  }
  if (await colExists('subscriptionPayments', 'createdAt')) {
    await run('ALTER TABLE subscriptionPayments DROP COLUMN createdAt', 'Drop createdAt');
  }

  // ========== COMPANY SETTINGS ==========
  console.log('\n--- companySettings ---');
  await run('ALTER TABLE companySettings MODIFY COLUMN companyName VARCHAR(255) DEFAULT "Tu Placa" NOT NULL', 'Fix companyName');
  await run('ALTER TABLE companySettings MODIFY COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL', 'Fix updatedAt');
  if (await colExists('companySettings', 'rnc')) {
    await run('ALTER TABLE companySettings DROP COLUMN rnc', 'Drop rnc');
  }
  if (await colExists('companySettings', 'itbis1')) {
    await run('ALTER TABLE companySettings DROP COLUMN itbis1', 'Drop itbis1');
  }
  if (await colExists('companySettings', 'itbis2')) {
    await run('ALTER TABLE companySettings DROP COLUMN itbis2', 'Drop itbis2');
  }
  if (await colExists('companySettings', 'paymentMethod')) {
    await run('ALTER TABLE companySettings DROP COLUMN paymentMethod', 'Drop paymentMethod');
  }
  if (await colExists('companySettings', 'defaultCurrency')) {
    await run('ALTER TABLE companySettings DROP COLUMN defaultCurrency', 'Drop defaultCurrency');
  }

  // ========== CLOVER ACCOUNTS ==========
  console.log('\n--- cloverAccounts ---');
  await run('ALTER TABLE cloverAccounts MODIFY COLUMN merchantId VARCHAR(255) NOT NULL', 'Fix merchantId');
  await run('ALTER TABLE cloverAccounts MODIFY COLUMN connectedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix connectedAt');
  await run('ALTER TABLE cloverAccounts MODIFY COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL', 'Fix updatedAt');

  // ========== CLOVER TRANSACTIONS ==========
  console.log('\n--- cloverTransactions ---');
  await run('ALTER TABLE cloverTransactions MODIFY COLUMN amount DECIMAL(12,2) NOT NULL', 'Fix amount');
  await run('ALTER TABLE cloverTransactions MODIFY COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL', 'Fix createdAt');
  await run('ALTER TABLE cloverTransactions MODIFY COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL', 'Fix updatedAt');
  if (await colExists('cloverTransactions', 'paymentMethod')) {
    await run('ALTER TABLE cloverTransactions DROP COLUMN paymentMethod', 'Drop paymentMethod');
  }

  console.log('\n=== DONE ===');
  await pool.end();
}

main().catch(console.error);
