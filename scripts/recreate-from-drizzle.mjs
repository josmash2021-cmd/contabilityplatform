import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool({
    host: 'autorack.proxy.rlwy.net',
    port: 25778,
    user: 'root',
    password: 'chLSOgeGMqHDzbtLNNovdLhggsGMmzLw',
    database: 'railway',
    multipleStatements: true
  });

  console.log('=== RECREATING TABLES FROM DRIZZLE SCHEMA ===\n');

  // Disable foreign key checks temporarily
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0');

  // Drop all existing tables
  const tables = [
    'journalEntryLines', 'journalEntries', 'paymentRecords', 'saleServices',
    'sales', 'expenses', 'bankTransactions', 'bankAccounts', 'cloverTransactions',
    'cloverAccounts', 'subscriptionPayments', 'subscriptions', 'companySettings',
    'accounts', 'services', 'customers', 'passwordResetCodes', 'users'
  ];

  for (const table of tables) {
    try {
      await pool.execute(`DROP TABLE IF EXISTS ${table}`);
      console.log(`✓ Dropped ${table}`);
    } catch(e) {
      console.log(`✗ Failed to drop ${table}: ${e.message.substring(0, 60)}`);
    }
  }

  // Create tables in correct order (dependencies first)
  const createStatements = [
    // Users
    `CREATE TABLE users (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      unionId varchar(255),
      email varchar(320) NOT NULL,
      password varchar(255),
      name varchar(255),
      avatar text,
      role enum('user','admin') DEFAULT 'user' NOT NULL,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      lastSignInAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      UNIQUE KEY users_email_unique (email),
      UNIQUE KEY users_unionId_unique (unionId),
      KEY users_email_idx (email),
      KEY users_unionId_idx (unionId)
    )`,

    // Password Reset Codes
    `CREATE TABLE passwordResetCodes (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      email varchar(320) NOT NULL,
      code varchar(6) NOT NULL,
      expiresAt timestamp NOT NULL,
      used tinyint(1) DEFAULT 0,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      KEY reset_codes_email_idx (email),
      KEY reset_codes_email_used_idx (email, used)
    )`,

    // Services
    `CREATE TABLE services (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      name varchar(255) NOT NULL,
      description text,
      price decimal(10,2) NOT NULL,
      cost decimal(10,2) DEFAULT '0',
      categoryId bigint unsigned,
      isActive tinyint(1) DEFAULT 1,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      KEY services_userId_idx (userId),
      KEY services_userId_isActive_idx (userId, isActive),
      CONSTRAINT services_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Customers
    `CREATE TABLE customers (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      name varchar(255) NOT NULL,
      lastName varchar(255),
      email varchar(320),
      phone varchar(50),
      address text,
      zelleEmail varchar(320),
      carBrand varchar(100),
      carModel varchar(100),
      carYear varchar(20),
      plateNumber varchar(50),
      plateExpiryDate date,
      transactionDate date,
      clientType enum('placas','titulos') DEFAULT 'placas' NOT NULL,
      paymentAmount decimal(12,2) DEFAULT '0',
      paymentHistory text,
      notes text,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      KEY customers_userId_idx (userId),
      KEY customers_userId_clientType_idx (userId, clientType),
      KEY customers_name_idx (name),
      CONSTRAINT customers_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Sales
    `CREATE TABLE sales (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      invoiceNumber varchar(50) NOT NULL,
      customerId bigint unsigned,
      customerName varchar(255),
      subtotal decimal(12,2) NOT NULL,
      discount decimal(12,2) DEFAULT '0',
      total decimal(12,2) NOT NULL,
      paymentMethod enum('cash','zelle','card','mixed') NOT NULL,
      status enum('completed','pending','cancelled','refunded') DEFAULT 'completed' NOT NULL,
      notes text,
      createdBy bigint unsigned,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      UNIQUE KEY sales_invoiceNumber_idx (invoiceNumber),
      KEY sales_createdBy_idx (createdBy),
      KEY sales_createdBy_createdAt_idx (createdBy, createdAt),
      KEY sales_status_idx (status),
      KEY sales_customerId_idx (customerId),
      CONSTRAINT sales_customerId_customers_id_fk FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL,
      CONSTRAINT sales_createdBy_users_id_fk FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
    )`,

    // Sale Services
    `CREATE TABLE saleServices (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      saleId bigint unsigned NOT NULL,
      serviceId bigint unsigned NOT NULL,
      serviceName varchar(255) NOT NULL,
      quantity int NOT NULL,
      unitPrice decimal(10,2) NOT NULL,
      total decimal(10,2) NOT NULL,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      KEY saleServices_saleId_idx (saleId),
      KEY saleServices_serviceId_idx (serviceId),
      CONSTRAINT saleServices_saleId_sales_id_fk FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
      CONSTRAINT saleServices_serviceId_services_id_fk FOREIGN KEY (serviceId) REFERENCES services(id) ON DELETE RESTRICT
    )`,

    // Payment Records
    `CREATE TABLE paymentRecords (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      saleId bigint unsigned,
      method enum('cash','zelle','card') NOT NULL,
      amount decimal(12,2) NOT NULL,
      reference varchar(255),
      status enum('completed','pending','failed','refunded') DEFAULT 'completed' NOT NULL,
      confirmedAt timestamp DEFAULT CURRENT_TIMESTAMP,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      KEY paymentRecords_saleId_idx (saleId),
      CONSTRAINT paymentRecords_saleId_sales_id_fk FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE
    )`,

    // Accounts
    `CREATE TABLE accounts (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      code varchar(20) NOT NULL,
      name varchar(255) NOT NULL,
      type enum('asset','liability','equity','revenue','expense') NOT NULL,
      parentId bigint unsigned,
      balance decimal(14,2) DEFAULT '0',
      isActive tinyint(1) DEFAULT 1,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      UNIQUE KEY accounts_userId_code_idx (userId, code),
      KEY accounts_userId_idx (userId),
      CONSTRAINT accounts_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT accounts_parentId_accounts_id_fk FOREIGN KEY (parentId) REFERENCES accounts(id) ON DELETE SET NULL
    )`,

    // Journal Entries
    `CREATE TABLE journalEntries (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      entryNumber varchar(50) NOT NULL,
      date date NOT NULL,
      description text NOT NULL,
      reference varchar(100),
      referenceId bigint unsigned,
      referenceType enum('sale','purchase','payment','adjustment','opening'),
      debitTotal decimal(14,2) NOT NULL,
      creditTotal decimal(14,2) NOT NULL,
      isPosted tinyint(1) DEFAULT 1,
      createdBy bigint unsigned,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      UNIQUE KEY journalEntries_entryNumber_idx (entryNumber),
      KEY journalEntries_createdBy_idx (createdBy),
      KEY journalEntries_createdAt_idx (createdAt),
      CONSTRAINT journalEntries_createdBy_users_id_fk FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
    )`,

    // Journal Entry Lines
    `CREATE TABLE journalEntryLines (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      journalEntryId bigint unsigned NOT NULL,
      accountId bigint unsigned NOT NULL,
      debit decimal(14,2) DEFAULT '0',
      credit decimal(14,2) DEFAULT '0',
      description text,
      KEY journalEntryLines_journalEntryId_idx (journalEntryId),
      KEY journalEntryLines_accountId_idx (accountId),
      CONSTRAINT journalEntryLines_journalEntryId_journalEntries_id_fk FOREIGN KEY (journalEntryId) REFERENCES journalEntries(id) ON DELETE CASCADE,
      CONSTRAINT journalEntryLines_accountId_accounts_id_fk FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE RESTRICT
    )`,

    // Period Closures
    `CREATE TABLE periodClosures (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      year int NOT NULL,
      month int NOT NULL,
      closedAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      closedBy bigint unsigned NOT NULL,
      KEY periodClosures_userId_year_month_idx (userId, year, month),
      CONSTRAINT periodClosures_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT periodClosures_closedBy_users_id_fk FOREIGN KEY (closedBy) REFERENCES users(id) ON DELETE RESTRICT
    )`,

    // Expenses
    `CREATE TABLE expenses (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      description varchar(255) NOT NULL,
      category varchar(100) NOT NULL,
      subcategory varchar(100),
      amount decimal(12,2) NOT NULL,
      paymentMethod enum('cash','zelle','card') NOT NULL,
      date date NOT NULL,
      reference varchar(255),
      receipt text,
      notes text,
      createdBy bigint unsigned,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      KEY expenses_createdBy_idx (createdBy),
      KEY expenses_date_idx (date),
      KEY expenses_createdBy_date_idx (createdBy, date),
      KEY expenses_category_idx (category),
      CONSTRAINT expenses_createdBy_users_id_fk FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
    )`,

    // Bank Accounts
    `CREATE TABLE bankAccounts (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      bankName varchar(100) NOT NULL,
      accountNumber varchar(50),
      accountType varchar(50) DEFAULT 'checking',
      currentBalance decimal(14,2) DEFAULT '0',
      isActive tinyint(1) DEFAULT 1,
      connectedAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      plaidAccessToken text,
      plaidItemId varchar(255),
      plaidAccountId varchar(255),
      lastSyncedAt timestamp,
      KEY bankAccounts_userId_idx (userId),
      CONSTRAINT bankAccounts_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Bank Transactions
    `CREATE TABLE bankTransactions (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      bankAccountId bigint unsigned,
      bankName varchar(100),
      accountNumber varchar(50),
      transactionDate date NOT NULL,
      transactionTime time,
      description varchar(255) NOT NULL,
      amount decimal(12,2) NOT NULL,
      type enum('income','expense') NOT NULL,
      category enum('business_expense','home_expense','shopping','subscription','zelle_income','cash_income','transfer','other','zelle_sent','cash_withdrawal','deposit','cash_deposit') DEFAULT 'other' NOT NULL,
      subcategory varchar(100),
      reference varchar(255),
      plaidAmount decimal(12,2),
      balanceAfter decimal(14,2),
      isReconciled tinyint(1) DEFAULT 0,
      notes text,
      importedFrom varchar(50),
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      KEY bankTransactions_userId_idx (userId),
      KEY bankTransactions_userId_transactionDate_idx (userId, transactionDate),
      KEY bankTransactions_userId_type_idx (userId, type),
      KEY bankTransactions_userId_category_idx (userId, category),
      CONSTRAINT bankTransactions_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT bankTransactions_bankAccountId_bankAccounts_id_fk FOREIGN KEY (bankAccountId) REFERENCES bankAccounts(id) ON DELETE SET NULL
    )`,

    // Subscriptions
    `CREATE TABLE subscriptions (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      stripeCustomerId varchar(255),
      stripeSubscriptionId varchar(255),
      stripePriceId varchar(255),
      plan enum('monthly','annual') NOT NULL,
      status enum('active','cancelled','past_due','unpaid','trialing') DEFAULT 'active' NOT NULL,
      currentPeriodStart timestamp,
      currentPeriodEnd timestamp,
      cancelAtPeriodEnd tinyint(1) DEFAULT 0,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      KEY subscriptions_userId_idx (userId),
      KEY subscriptions_stripeSubscriptionId_idx (stripeSubscriptionId),
      CONSTRAINT subscriptions_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Subscription Payments
    `CREATE TABLE subscriptionPayments (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      subscriptionId bigint unsigned,
      stripePaymentIntentId varchar(255),
      stripeInvoiceId varchar(255),
      amount decimal(10,2) NOT NULL,
      plan enum('monthly','annual') NOT NULL,
      status enum('succeeded','pending','failed') DEFAULT 'pending' NOT NULL,
      receiptUrl text,
      paidAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      KEY subscriptionPayments_userId_idx (userId),
      CONSTRAINT subscriptionPayments_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT subscriptionPayments_subscriptionId_subscriptions_id_fk FOREIGN KEY (subscriptionId) REFERENCES subscriptions(id) ON DELETE SET NULL
    )`,

    // Company Settings
    `CREATE TABLE companySettings (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      companyName varchar(255) DEFAULT 'Tu Placa' NOT NULL,
      rif varchar(50),
      address text,
      phone varchar(50),
      email varchar(320),
      zelleEmail varchar(320),
      bankName varchar(100),
      bankAccountNumber varchar(50),
      taxRate decimal(5,2) DEFAULT '0.00',
      currency varchar(10) DEFAULT 'USD',
      logo text,
      updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      UNIQUE KEY companySettings_userId_idx (userId),
      CONSTRAINT companySettings_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Clover Accounts
    `CREATE TABLE cloverAccounts (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      merchantId varchar(255) NOT NULL,
      merchantName varchar(255),
      accessToken text,
      refreshToken text,
      deviceId varchar(255),
      deviceName varchar(255),
      tenderId varchar(255),
      isActive tinyint(1) DEFAULT 1,
      connectedAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      lastSyncedAt timestamp,
      KEY cloverAccounts_userId_idx (userId),
      CONSTRAINT cloverAccounts_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Clover Transactions
    `CREATE TABLE cloverTransactions (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
      userId bigint unsigned NOT NULL,
      cloverAccountId bigint unsigned,
      saleId bigint unsigned,
      cloverPaymentId varchar(255),
      cloverOrderId varchar(255),
      amount decimal(12,2) NOT NULL,
      status enum('pending','processing','completed','failed','cancelled','refunded') DEFAULT 'pending',
      cardLastFour varchar(4),
      cardType varchar(50),
      deviceName varchar(255),
      receiptUrl text,
      notes text,
      createdAt timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      KEY cloverTransactions_userId_idx (userId),
      CONSTRAINT cloverTransactions_userId_users_id_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT cloverTransactions_cloverAccountId_cloverAccounts_id_fk FOREIGN KEY (cloverAccountId) REFERENCES cloverAccounts(id) ON DELETE SET NULL,
      CONSTRAINT cloverTransactions_saleId_sales_id_fk FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE SET NULL
    )`
  ];

  for (const sql of createStatements) {
    const tableName = sql.match(/CREATE TABLE (\w+)/)?.[1] || 'unknown';
    try {
      await pool.execute(sql);
      console.log(`✓ Created ${tableName}`);
    } catch(e) {
      console.log(`✗ Failed to create ${tableName}: ${e.message.substring(0, 100)}`);
    }
  }

  // Re-enable foreign key checks
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1');

  console.log('\n=== DONE ===');
  await pool.end();
}

main().catch(console.error);
