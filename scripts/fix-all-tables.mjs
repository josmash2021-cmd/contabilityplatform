import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool({
    host: 'autorack.proxy.rlwy.net',
    port: 25778,
    user: 'root',
    password: 'chLSOgeGMqHDzbtLNNovdLhggsGMmzLw',
    database: 'railway'
  });

  // Fixes for each table - columns that exist in Drizzle schema but may be missing in DB
  const allFixes = [
    {
      table: 'sales',
      columns: [
        { name: 'customerName', sql: 'ALTER TABLE sales ADD COLUMN customerName VARCHAR(255)' },
        { name: 'createdBy', sql: 'ALTER TABLE sales ADD COLUMN createdBy BIGINT UNSIGNED' },
      ]
    },
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
    {
      table: 'companySettings',
      columns: [
        { name: 'rif', sql: 'ALTER TABLE companySettings ADD COLUMN rif VARCHAR(50)' },
        { name: 'taxRate', sql: 'ALTER TABLE companySettings ADD COLUMN taxRate DECIMAL(5,2) DEFAULT "0.00"' },
        { name: 'zelleEmail', sql: 'ALTER TABLE companySettings ADD COLUMN zelleEmail VARCHAR(320)' },
        { name: 'bankName', sql: 'ALTER TABLE companySettings ADD COLUMN bankName VARCHAR(100)' },
        { name: 'bankAccountNumber', sql: 'ALTER TABLE companySettings ADD COLUMN bankAccountNumber VARCHAR(50)' },
        { name: 'currency', sql: 'ALTER TABLE companySettings ADD COLUMN currency VARCHAR(10) DEFAULT "USD"' },
        { name: 'updatedAt', sql: 'ALTER TABLE companySettings ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'customers',
      columns: [
        { name: 'email', sql: 'ALTER TABLE customers ADD COLUMN email VARCHAR(320)' },
        { name: 'phone', sql: 'ALTER TABLE customers ADD COLUMN phone VARCHAR(50)' },
        { name: 'address', sql: 'ALTER TABLE customers ADD COLUMN address TEXT' },
        { name: 'notes', sql: 'ALTER TABLE customers ADD COLUMN notes TEXT' },
        { name: 'isActive', sql: 'ALTER TABLE customers ADD COLUMN isActive TINYINT(1) DEFAULT 1' },
        { name: 'createdBy', sql: 'ALTER TABLE customers ADD COLUMN createdBy BIGINT UNSIGNED' },
        { name: 'createdAt', sql: 'ALTER TABLE customers ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updatedAt', sql: 'ALTER TABLE customers ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'services',
      columns: [
        { name: 'description', sql: 'ALTER TABLE services ADD COLUMN description TEXT' },
        { name: 'isActive', sql: 'ALTER TABLE services ADD COLUMN isActive TINYINT(1) DEFAULT 1' },
        { name: 'createdBy', sql: 'ALTER TABLE services ADD COLUMN createdBy BIGINT UNSIGNED' },
        { name: 'createdAt', sql: 'ALTER TABLE services ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updatedAt', sql: 'ALTER TABLE services ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'expenses',
      columns: [
        { name: 'category', sql: 'ALTER TABLE expenses ADD COLUMN category VARCHAR(100)' },
        { name: 'receiptUrl', sql: 'ALTER TABLE expenses ADD COLUMN receiptUrl TEXT' },
        { name: 'isRecurring', sql: 'ALTER TABLE expenses ADD COLUMN isRecurring TINYINT(1) DEFAULT 0' },
        { name: 'recurringFrequency', sql: 'ALTER TABLE expenses ADD COLUMN recurringFrequency VARCHAR(50)' },
        { name: 'createdBy', sql: 'ALTER TABLE expenses ADD COLUMN createdBy BIGINT UNSIGNED' },
        { name: 'createdAt', sql: 'ALTER TABLE expenses ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updatedAt', sql: 'ALTER TABLE expenses ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'accounts',
      columns: [
        { name: 'code', sql: 'ALTER TABLE accounts ADD COLUMN code VARCHAR(20)' },
        { name: 'type', sql: 'ALTER TABLE accounts ADD COLUMN type VARCHAR(50)' },
        { name: 'parentId', sql: 'ALTER TABLE accounts ADD COLUMN parentId BIGINT UNSIGNED' },
        { name: 'isActive', sql: 'ALTER TABLE accounts ADD COLUMN isActive TINYINT(1) DEFAULT 1' },
        { name: 'createdBy', sql: 'ALTER TABLE accounts ADD COLUMN createdBy BIGINT UNSIGNED' },
        { name: 'createdAt', sql: 'ALTER TABLE accounts ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updatedAt', sql: 'ALTER TABLE accounts ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'journalEntries',
      columns: [
        { name: 'entryNumber', sql: 'ALTER TABLE journalEntries ADD COLUMN entryNumber VARCHAR(50)' },
        { name: 'reference', sql: 'ALTER TABLE journalEntries ADD COLUMN reference VARCHAR(255)' },
        { name: 'notes', sql: 'ALTER TABLE journalEntries ADD COLUMN notes TEXT' },
        { name: 'createdBy', sql: 'ALTER TABLE journalEntries ADD COLUMN createdBy BIGINT UNSIGNED' },
        { name: 'createdAt', sql: 'ALTER TABLE journalEntries ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updatedAt', sql: 'ALTER TABLE journalEntries ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'journalEntryLines',
      columns: [
        { name: 'debit', sql: 'ALTER TABLE journalEntryLines ADD COLUMN debit DECIMAL(14,2) DEFAULT "0"' },
        { name: 'credit', sql: 'ALTER TABLE journalEntryLines ADD COLUMN credit DECIMAL(14,2) DEFAULT "0"' },
        { name: 'description', sql: 'ALTER TABLE journalEntryLines ADD COLUMN description TEXT' },
        { name: 'createdAt', sql: 'ALTER TABLE journalEntryLines ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'periodClosures',
      columns: [
        { name: 'closedBy', sql: 'ALTER TABLE periodClosures ADD COLUMN closedBy BIGINT UNSIGNED' },
        { name: 'notes', sql: 'ALTER TABLE periodClosures ADD COLUMN notes TEXT' },
        { name: 'createdAt', sql: 'ALTER TABLE periodClosures ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updatedAt', sql: 'ALTER TABLE periodClosures ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'bankTransactions',
      columns: [
        { name: 'bankName', sql: 'ALTER TABLE bankTransactions ADD COLUMN bankName VARCHAR(100)' },
        { name: 'accountNumber', sql: 'ALTER TABLE bankTransactions ADD COLUMN accountNumber VARCHAR(50)' },
        { name: 'transactionTime', sql: 'ALTER TABLE bankTransactions ADD COLUMN transactionTime TIME' },
        { name: 'subcategory', sql: 'ALTER TABLE bankTransactions ADD COLUMN subcategory VARCHAR(100)' },
        { name: 'reference', sql: 'ALTER TABLE bankTransactions ADD COLUMN reference VARCHAR(255)' },
        { name: 'plaidAmount', sql: 'ALTER TABLE bankTransactions ADD COLUMN plaidAmount DECIMAL(12,2)' },
        { name: 'balanceAfter', sql: 'ALTER TABLE bankTransactions ADD COLUMN balanceAfter DECIMAL(14,2)' },
        { name: 'isReconciled', sql: 'ALTER TABLE bankTransactions ADD COLUMN isReconciled TINYINT(1) DEFAULT 0' },
        { name: 'createdAt', sql: 'ALTER TABLE bankTransactions ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updatedAt', sql: 'ALTER TABLE bankTransactions ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'subscriptions',
      columns: [
        { name: 'stripeCustomerId', sql: 'ALTER TABLE subscriptions ADD COLUMN stripeCustomerId VARCHAR(255)' },
        { name: 'stripeSubscriptionId', sql: 'ALTER TABLE subscriptions ADD COLUMN stripeSubscriptionId VARCHAR(255)' },
        { name: 'plan', sql: 'ALTER TABLE subscriptions ADD COLUMN plan VARCHAR(50)' },
        { name: 'status', sql: 'ALTER TABLE subscriptions ADD COLUMN status VARCHAR(50) DEFAULT "inactive"' },
        { name: 'currentPeriodStart', sql: 'ALTER TABLE subscriptions ADD COLUMN currentPeriodStart TIMESTAMP' },
        { name: 'currentPeriodEnd', sql: 'ALTER TABLE subscriptions ADD COLUMN currentPeriodEnd TIMESTAMP' },
        { name: 'cancelAtPeriodEnd', sql: 'ALTER TABLE subscriptions ADD COLUMN cancelAtPeriodEnd TINYINT(1) DEFAULT 0' },
        { name: 'createdAt', sql: 'ALTER TABLE subscriptions ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updatedAt', sql: 'ALTER TABLE subscriptions ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'subscriptionPayments',
      columns: [
        { name: 'subscriptionId', sql: 'ALTER TABLE subscriptionPayments ADD COLUMN subscriptionId BIGINT UNSIGNED' },
        { name: 'stripeInvoiceId', sql: 'ALTER TABLE subscriptionPayments ADD COLUMN stripeInvoiceId VARCHAR(255)' },
        { name: 'plan', sql: 'ALTER TABLE subscriptionPayments ADD COLUMN plan VARCHAR(50)' },
        { name: 'receiptUrl', sql: 'ALTER TABLE subscriptionPayments ADD COLUMN receiptUrl TEXT' },
        { name: 'createdAt', sql: 'ALTER TABLE subscriptionPayments ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'cloverAccounts',
      columns: [
        { name: 'merchantName', sql: 'ALTER TABLE cloverAccounts ADD COLUMN merchantName VARCHAR(255)' },
        { name: 'accessToken', sql: 'ALTER TABLE cloverAccounts ADD COLUMN accessToken TEXT' },
        { name: 'refreshToken', sql: 'ALTER TABLE cloverAccounts ADD COLUMN refreshToken TEXT' },
        { name: 'deviceId', sql: 'ALTER TABLE cloverAccounts ADD COLUMN deviceId VARCHAR(255)' },
        { name: 'deviceName', sql: 'ALTER TABLE cloverAccounts ADD COLUMN deviceName VARCHAR(255)' },
        { name: 'tenderId', sql: 'ALTER TABLE cloverAccounts ADD COLUMN tenderId VARCHAR(255)' },
        { name: 'isActive', sql: 'ALTER TABLE cloverAccounts ADD COLUMN isActive TINYINT(1) DEFAULT 1' },
        { name: 'connectedAt', sql: 'ALTER TABLE cloverAccounts ADD COLUMN connectedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updatedAt', sql: 'ALTER TABLE cloverAccounts ADD COLUMN updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
        { name: 'lastSyncedAt', sql: 'ALTER TABLE cloverAccounts ADD COLUMN lastSyncedAt TIMESTAMP' },
      ]
    },
    {
      table: 'cloverTransactions',
      columns: [
        { name: 'cloverAccountId', sql: 'ALTER TABLE cloverTransactions ADD COLUMN cloverAccountId BIGINT UNSIGNED' },
        { name: 'saleId', sql: 'ALTER TABLE cloverTransactions ADD COLUMN saleId BIGINT UNSIGNED' },
        { name: 'cloverPaymentId', sql: 'ALTER TABLE cloverTransactions ADD COLUMN cloverPaymentId VARCHAR(255)' },
        { name: 'amount', sql: 'ALTER TABLE cloverTransactions ADD COLUMN amount DECIMAL(12,2)' },
        { name: 'tipAmount', sql: 'ALTER TABLE cloverTransactions ADD COLUMN tipAmount DECIMAL(12,2) DEFAULT "0"' },
        { name: 'status', sql: 'ALTER TABLE cloverTransactions ADD COLUMN status VARCHAR(50)' },
        { name: 'paymentMethod', sql: 'ALTER TABLE cloverTransactions ADD COLUMN paymentMethod VARCHAR(50)' },
        { name: 'createdAt', sql: 'ALTER TABLE cloverTransactions ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'paymentRecords',
      columns: [
        { name: 'saleId', sql: 'ALTER TABLE paymentRecords ADD COLUMN saleId BIGINT UNSIGNED' },
        { name: 'amount', sql: 'ALTER TABLE paymentRecords ADD COLUMN amount DECIMAL(12,2)' },
        { name: 'paymentMethod', sql: 'ALTER TABLE paymentRecords ADD COLUMN paymentMethod VARCHAR(50)' },
        { name: 'reference', sql: 'ALTER TABLE paymentRecords ADD COLUMN reference VARCHAR(255)' },
        { name: 'notes', sql: 'ALTER TABLE paymentRecords ADD COLUMN notes TEXT' },
        { name: 'createdBy', sql: 'ALTER TABLE paymentRecords ADD COLUMN createdBy BIGINT UNSIGNED' },
        { name: 'createdAt', sql: 'ALTER TABLE paymentRecords ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      ]
    },
    {
      table: 'saleServices',
      columns: [
        { name: 'serviceName', sql: 'ALTER TABLE saleServices ADD COLUMN serviceName VARCHAR(255)' },
        { name: 'quantity', sql: 'ALTER TABLE saleServices ADD COLUMN quantity DECIMAL(10,2) DEFAULT "1"' },
        { name: 'unitPrice', sql: 'ALTER TABLE saleServices ADD COLUMN unitPrice DECIMAL(12,2)' },
        { name: 'totalPrice', sql: 'ALTER TABLE saleServices ADD COLUMN totalPrice DECIMAL(12,2)' },
        { name: 'createdAt', sql: 'ALTER TABLE saleServices ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      ]
    },
  ];

  for (const fix of allFixes) {
    console.log(`\n📋 Checking ${fix.table}...`);
    try {
      const [columns] = await pool.query(`DESCRIBE ${fix.table}`);
      const columnNames = columns.map(c => c.Field);
      
      let added = 0;
      for (const col of fix.columns) {
        if (!columnNames.includes(col.name)) {
          try {
            await pool.execute(col.sql);
            console.log(`  ✓ Added: ${col.name}`);
            added++;
          } catch (e) {
            if (e.message.includes('Duplicate')) {
              console.log(`  ⚠ Already exists: ${col.name}`);
            } else {
              console.error(`  ✗ Failed ${col.name}:`, e.message.substring(0, 80));
            }
          }
        }
      }
      if (added === 0) {
        console.log(`  ✓ All columns present`);
      }
    } catch (e) {
      console.error(`  ✗ Error:`, e.message.substring(0, 100));
    }
  }

  console.log('\n✅ Done! All tables checked and fixed.');
  await pool.end();
}

main().catch(console.error);
