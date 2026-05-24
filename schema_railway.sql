-- Crear tablas básicas para Railway
SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  unionId varchar(255),
  name varchar(255),
  email varchar(320) NOT NULL,
  avatar text,
  role varchar(50) DEFAULT 'user',
  password varchar(255),
  createdAt timestamp DEFAULT now(),
  updatedAt timestamp DEFAULT now(),
  UNIQUE(email)
);

INSERT INTO users (id, name, email, role, password, createdAt) VALUES 
(1, 'Admin', 'admin@tuplaca.com', 'admin', '$2a$10$hashed', '2026-05-15 00:00:00'),
(2, 'Angel', 'angel@tuplaca.com', 'user', '$2a$10$hashed', '2026-05-15 00:00:00');

DROP TABLE IF EXISTS accounts;
CREATE TABLE accounts (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  code varchar(20) NOT NULL,
  name varchar(255) NOT NULL,
  type enum('asset','liability','equity','revenue','expense') NOT NULL,
  parentId bigint unsigned DEFAULT NULL,
  balance decimal(14,2) DEFAULT 0,
  isActive tinyint(1) DEFAULT 1,
  createdAt timestamp DEFAULT now(),
  userId bigint unsigned NOT NULL
);

INSERT INTO accounts VALUES 
(1,'1000','Activos','asset',NULL,0,1,'2026-05-15 00:00:00',1),
(2,'1100','Efectivo y Equivalentes','asset',1,0,1,'2026-05-15 00:00:00',1),
(3,'1110','Caja','asset',2,0,1,'2026-05-15 00:00:00',1),
(4,'1120','Banco','asset',2,0,1,'2026-05-15 00:00:00',1),
(5,'1130','Zelle','asset',2,0,1,'2026-05-15 00:00:00',1),
(6,'1150','Cuentas por Cobrar','asset',2,0,1,'2026-05-15 00:00:00',1),
(7,'2000','Pasivos','liability',NULL,0,1,'2026-05-15 00:00:00',1),
(8,'2100','Cuentas por Pagar','liability',7,0,1,'2026-05-15 00:00:00',1),
(9,'3000','Patrimonio','equity',NULL,0,1,'2026-05-15 00:00:00',1),
(10,'3100','Capital Social','equity',9,0,1,'2026-05-15 00:00:00',1),
(11,'3110','Resultado del Ejercicio','equity',9,0,1,'2026-05-15 00:00:00',1),
(12,'4000','Ingresos','revenue',NULL,0,1,'2026-05-15 00:00:00',1),
(13,'4100','Ventas de Servicios','revenue',12,0,1,'2026-05-15 00:00:00',1),
(14,'4200','Ingresos Bancarios','revenue',12,0,1,'2026-05-15 00:00:00',1),
(15,'5000','Gastos','expense',NULL,0,1,'2026-05-15 00:00:00',1),
(16,'5100','Costo de Ventas','expense',15,0,1,'2026-05-15 00:00:00',1),
(17,'5200','Gastos Administrativos','expense',15,0,1,'2026-05-15 00:00:00',1);

DROP TABLE IF EXISTS companySettings;
CREATE TABLE companySettings (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  companyName varchar(255),
  rnc varchar(50),
  address text,
  phone varchar(50),
  email varchar(320),
  logo text,
  itbis1 decimal(5,2) DEFAULT 18,
  itbis2 decimal(5,2) DEFAULT 10,
  paymentMethod varchar(50) DEFAULT 'cash',
  defaultCurrency varchar(10) DEFAULT 'DOP',
  userId bigint unsigned NOT NULL
);

INSERT INTO companySettings (id, companyName, rnc, address, phone, email, paymentMethod, defaultCurrency, userId) 
VALUES (1, 'TU PLACA EXPRESS LLC', '', '', '', '', 'zelle', 'USD', 1);

DROP TABLE IF EXISTS bankAccounts;
CREATE TABLE bankAccounts (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  userId bigint unsigned NOT NULL,
  institution varchar(255),
  accountNumber varchar(255),
  accountType varchar(100),
  balance decimal(12,2) DEFAULT 0,
  currency varchar(10) DEFAULT 'USD',
  status enum('active','inactive','disconnected') DEFAULT 'active',
  createdAt timestamp DEFAULT now(),
  plaidAccessToken text,
  plaidItemId varchar(255),
  plaidAccountId varchar(255),
  lastSyncedAt timestamp,
  name varchar(255)
);

DROP TABLE IF EXISTS bankTransactions;
CREATE TABLE bankTransactions (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  userId bigint unsigned NOT NULL,
  bankAccountId bigint unsigned,
  plaidTransactionId varchar(255),
  amount decimal(12,2) NOT NULL,
  currency varchar(10) DEFAULT 'USD',
  description text,
  category enum('business_expense','home_expense','shopping','subscription','zelle_income','cash_income','transfer','other','zelle_sent','cash_withdrawal','deposit','cash_deposit') DEFAULT 'other',
  transactionDate date NOT NULL,
  status enum('pending','completed','cancelled','failed') DEFAULT 'completed',
  createdAt timestamp DEFAULT now(),
  plaidAmount decimal(12,2)
);

DROP TABLE IF EXISTS services;
CREATE TABLE services (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  name varchar(255),
  description text,
  price decimal(10,2),
  cost decimal(10,2),
  categoryId bigint unsigned,
  isActive tinyint(1) DEFAULT 1,
  createdAt timestamp DEFAULT now(),
  updatedAt timestamp DEFAULT now(),
  userId bigint unsigned NOT NULL
);

INSERT INTO services VALUES 
(1,'Renovacion de Placas','Servicio de renovacion',50.00,0.00,1,1,'2026-05-15 00:00:00','2026-05-15 00:00:00',1),
(2,'Transferencia de Titulo','Servicio de transferencia',75.00,0.00,1,1,'2026-05-15 00:00:00','2026-05-15 00:00:00',1),
(3,'Registro de Vehiculo','Registro nuevo',100.00,0.00,1,1,'2026-05-15 00:00:00','2026-05-15 00:00:00',1);

DROP TABLE IF EXISTS sales;
CREATE TABLE sales (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  invoiceNumber varchar(50),
  customerId bigint unsigned,
  userId bigint unsigned NOT NULL,
  total decimal(12,2) NOT NULL,
  paymentMethod enum('cash','zelle','card','mixed') NOT NULL,
  status enum('pending','paid','cancelled') DEFAULT 'pending',
  createdAt timestamp DEFAULT now(),
  updatedAt timestamp DEFAULT now(),
  notes text,
  itbis decimal(12,2) DEFAULT 0,
  discount decimal(12,2) DEFAULT 0,
  subtotal decimal(12,2) DEFAULT 0
);

DROP TABLE IF EXISTS customers;
CREATE TABLE customers (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  name varchar(255),
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
  clientType enum('placas','titulos'),
  paymentAmount decimal(12,2),
  paymentHistory text,
  notes text,
  createdAt timestamp DEFAULT now(),
  updatedAt timestamp DEFAULT now(),
  userId bigint unsigned NOT NULL
);

DROP TABLE IF EXISTS expenses;
CREATE TABLE expenses (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  description text NOT NULL,
  amount decimal(12,2) NOT NULL,
  category enum('operating','marketing','salary','utilities','rent','supplies','other') DEFAULT 'other',
  date date NOT NULL,
  status enum('pending','paid','cancelled') DEFAULT 'paid',
  createdBy bigint unsigned NOT NULL,
  createdAt timestamp DEFAULT now(),
  updatedAt timestamp DEFAULT now()
);

DROP TABLE IF EXISTS journalEntries;
CREATE TABLE journalEntries (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  entryNumber varchar(50) NOT NULL,
  date date NOT NULL,
  description text,
  referenceType enum('sale','purchase','payment','adjustment','opening') DEFAULT 'adjustment',
  referenceId bigint unsigned,
  createdBy bigint unsigned NOT NULL,
  createdAt timestamp DEFAULT now(),
  updatedAt timestamp DEFAULT now(),
  UNIQUE(entryNumber)
);

DROP TABLE IF EXISTS journalEntryLines;
CREATE TABLE journalEntryLines (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  journalEntryId bigint unsigned NOT NULL,
  accountId bigint unsigned NOT NULL,
  debit decimal(14,2) DEFAULT 0,
  credit decimal(14,2) DEFAULT 0,
  description text,
  createdAt timestamp DEFAULT now()
);

DROP TABLE IF EXISTS periodClosures;
CREATE TABLE periodClosures (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  year int NOT NULL,
  month int NOT NULL,
  userId bigint unsigned NOT NULL,
  closedAt timestamp DEFAULT now(),
  closedBy bigint unsigned,
  UNIQUE(year, month, userId)
);

DROP TABLE IF EXISTS passwordResetCodes;
CREATE TABLE passwordResetCodes (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  email varchar(320) NOT NULL,
  code varchar(10) NOT NULL,
  expiresAt timestamp NOT NULL,
  used tinyint(1) DEFAULT 0,
  createdAt timestamp DEFAULT now()
);

DROP TABLE IF EXISTS subscriptions;
CREATE TABLE subscriptions (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  userId bigint unsigned NOT NULL,
  stripeCustomerId varchar(255),
  stripeSubscriptionId varchar(255),
  status enum('active','inactive','cancelled','past_due') DEFAULT 'active',
 
  planId varchar(100),
  currentPeriodStart timestamp,
  currentPeriodEnd timestamp,
  createdAt timestamp DEFAULT now(),
  updatedAt timestamp DEFAULT now()
);

DROP TABLE IF EXISTS subscriptionPayments;
CREATE TABLE subscriptionPayments (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  userId bigint unsigned NOT NULL,
  subscriptionId bigint unsigned,
  stripePaymentIntentId varchar(255),
  amount decimal(12,2) NOT NULL,
  currency varchar(10) DEFAULT 'USD',
  status enum('succeeded','pending','failed') DEFAULT 'pending',
  createdAt timestamp DEFAULT now()
);

DROP TABLE IF EXISTS saleServices;
CREATE TABLE saleServices (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  saleId bigint unsigned NOT NULL,
  serviceId bigint unsigned NOT NULL,
  quantity int DEFAULT 1,
  price decimal(10,2) NOT NULL,
  total decimal(12,2) NOT NULL
);

DROP TABLE IF EXISTS paymentRecords;
CREATE TABLE paymentRecords (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  saleId bigint unsigned NOT NULL,
  amount decimal(12,2) NOT NULL,
  method enum('cash','zelle','card','transfer') NOT NULL,
  reference varchar(255),
  createdAt timestamp DEFAULT now()
);

DROP TABLE IF EXISTS cloverAccounts;
CREATE TABLE cloverAccounts (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  userId bigint unsigned NOT NULL,
  merchantId varchar(255),
  accessToken text,
  refreshToken text,
  deviceId varchar(255),
  deviceName varchar(255),
  status enum('active','inactive','disconnected') DEFAULT 'active',
  createdAt timestamp DEFAULT now(),
  updatedAt timestamp DEFAULT now(),
  tenderId varchar(255)
);

DROP TABLE IF EXISTS cloverTransactions;
CREATE TABLE cloverTransactions (
  id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  userId bigint unsigned NOT NULL,
  cloverAccountId bigint unsigned,
  externalId varchar(255),
  amount decimal(12,2) NOT NULL,
  currency varchar(10) DEFAULT 'USD',
  description text,
  status enum('pending','completed','cancelled','failed') DEFAULT 'pending',
  createdAt timestamp DEFAULT now(),
  saleId bigint unsigned
);
