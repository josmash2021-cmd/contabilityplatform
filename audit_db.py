#!/usr/bin/env python3
"""Auditoria completa: compara db/schema.ts con la base de datos MySQL real."""

import json
import os
import sys
import pymysql

# Fix encoding on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

DB_CONFIG = {
    "host": "autorack.proxy.rlwy.net",
    "port": 25778,
    "user": "root",
    "password": "chLSOgeGMqHDzbtLNNovdLhggsGMmzLw",
    "database": "railway",
    "cursorclass": pymysql.cursors.DictCursor,
}

# Schema extraido de db/schema.ts
DRIZZLE_SCHEMA = {
    "users": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "unionId": {"type": "varchar(255)", "unique": True},
        "email": {"type": "varchar(320)", "unique": True},
        "password": {"type": "varchar(255)"},
        "name": {"type": "varchar(255)"},
        "avatar": {"type": "text"},
        "role": {"type": "enum('user','admin')", "default": "user", "notNull": True},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "updatedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "lastSignInAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "passwordResetCodes": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "email": {"type": "varchar(320)", "notNull": True},
        "code": {"type": "varchar(6)", "notNull": True},
        "expiresAt": {"type": "timestamp", "notNull": True},
        "used": {"type": "boolean", "default": False},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "services": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "userId": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
        "name": {"type": "varchar(255)", "notNull": True},
        "description": {"type": "text"},
        "price": {"type": "decimal(10,2)", "notNull": True},
        "cost": {"type": "decimal(10,2)", "default": "0"},
        "categoryId": {"type": "bigint unsigned"},
        "isActive": {"type": "boolean", "default": True},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "updatedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "customers": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "userId": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
        "name": {"type": "varchar(255)", "notNull": True},
        "lastName": {"type": "varchar(255)"},
        "email": {"type": "varchar(320)"},
        "phone": {"type": "varchar(50)"},
        "address": {"type": "text"},
        "zelleEmail": {"type": "varchar(320)"},
        "carBrand": {"type": "varchar(100)"},
        "carModel": {"type": "varchar(100)"},
        "carYear": {"type": "varchar(20)"},
        "plateNumber": {"type": "varchar(50)"},
        "plateExpiryDate": {"type": "date"},
        "transactionDate": {"type": "date"},
        "clientType": {"type": "enum('placas','titulos')", "default": "placas", "notNull": True},
        "paymentAmount": {"type": "decimal(12,2)", "default": "0"},
        "paymentHistory": {"type": "text"},
        "notes": {"type": "text"},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "updatedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "sales": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "invoiceNumber": {"type": "varchar(50)", "notNull": True},
        "customerId": {"type": "bigint unsigned", "fk": "customers.id"},
        "customerName": {"type": "varchar(255)"},
        "subtotal": {"type": "decimal(12,2)", "notNull": True},
        "discount": {"type": "decimal(12,2)", "default": "0"},
        "total": {"type": "decimal(12,2)", "notNull": True},
        "paymentMethod": {"type": "enum('cash','zelle','card','mixed')", "notNull": True},
        "status": {"type": "enum('completed','pending','cancelled','refunded')", "default": "completed", "notNull": True},
        "notes": {"type": "text"},
        "createdBy": {"type": "bigint unsigned", "fk": "users.id"},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "updatedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "saleServices": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "saleId": {"type": "bigint unsigned", "notNull": True, "fk": "sales.id"},
        "serviceId": {"type": "bigint unsigned", "notNull": True, "fk": "services.id"},
        "serviceName": {"type": "varchar(255)", "notNull": True},
        "quantity": {"type": "int", "notNull": True},
        "unitPrice": {"type": "decimal(10,2)", "notNull": True},
        "total": {"type": "decimal(10,2)", "notNull": True},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "paymentRecords": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "saleId": {"type": "bigint unsigned", "fk": "sales.id"},
        "method": {"type": "enum('cash','zelle','card')", "notNull": True},
        "amount": {"type": "decimal(12,2)", "notNull": True},
        "reference": {"type": "varchar(255)"},
        "status": {"type": "enum('completed','pending','failed','refunded')", "default": "completed", "notNull": True},
        "confirmedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP"},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "accounts": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "userId": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
        "code": {"type": "varchar(20)", "notNull": True},
        "name": {"type": "varchar(255)", "notNull": True},
        "type": {"type": "enum('asset','liability','equity','revenue','expense')", "notNull": True},
        "parentId": {"type": "bigint unsigned", "fk": "accounts.id"},
        "balance": {"type": "decimal(14,2)", "default": "0"},
        "isActive": {"type": "boolean", "default": True},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "journalEntries": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "entryNumber": {"type": "varchar(50)", "notNull": True},
        "date": {"type": "date", "notNull": True},
        "description": {"type": "text", "notNull": True},
        "reference": {"type": "varchar(100)"},
        "referenceId": {"type": "bigint unsigned"},
        "referenceType": {"type": "enum('sale','purchase','payment','adjustment','opening')"},
        "debitTotal": {"type": "decimal(14,2)", "notNull": True},
        "creditTotal": {"type": "decimal(14,2)", "notNull": True},
        "isPosted": {"type": "boolean", "default": True},
        "createdBy": {"type": "bigint unsigned", "fk": "users.id"},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "periodClosures": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "userId": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
        "year": {"type": "int", "notNull": True},
        "month": {"type": "int", "notNull": True},
        "closedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "closedBy": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
    },
    "journalEntryLines": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "journalEntryId": {"type": "bigint unsigned", "notNull": True, "fk": "journalEntries.id"},
        "accountId": {"type": "bigint unsigned", "notNull": True, "fk": "accounts.id"},
        "debit": {"type": "decimal(14,2)", "default": "0"},
        "credit": {"type": "decimal(14,2)", "default": "0"},
        "description": {"type": "text"},
    },
    "expenses": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "description": {"type": "varchar(255)", "notNull": True},
        "category": {"type": "varchar(100)", "notNull": True},
        "subcategory": {"type": "varchar(100)"},
        "amount": {"type": "decimal(12,2)", "notNull": True},
        "paymentMethod": {"type": "enum('cash','zelle','card')", "notNull": True},
        "date": {"type": "date", "notNull": True},
        "reference": {"type": "varchar(255)"},
        "receipt": {"type": "text"},
        "notes": {"type": "text"},
        "createdBy": {"type": "bigint unsigned", "fk": "users.id"},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "bankAccounts": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "userId": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
        "bankName": {"type": "varchar(100)", "notNull": True},
        "accountNumber": {"type": "varchar(50)"},
        "accountType": {"type": "varchar(50)", "default": "checking"},
        "currentBalance": {"type": "decimal(14,2)", "default": "0"},
        "isActive": {"type": "boolean", "default": True},
        "connectedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "updatedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "plaidAccessToken": {"type": "text"},
        "plaidItemId": {"type": "varchar(255)"},
        "plaidAccountId": {"type": "varchar(255)"},
        "lastSyncedAt": {"type": "timestamp"},
    },
    "bankTransactions": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "userId": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
        "bankAccountId": {"type": "bigint unsigned", "fk": "bankAccounts.id"},
        "bankName": {"type": "varchar(100)"},
        "accountNumber": {"type": "varchar(50)"},
        "transactionDate": {"type": "date", "notNull": True},
        "transactionTime": {"type": "time"},
        "description": {"type": "varchar(255)", "notNull": True},
        "amount": {"type": "decimal(12,2)", "notNull": True},
        "type": {"type": "enum('income','expense')", "notNull": True},
        "category": {"type": "enum('business_expense','home_expense','shopping','subscription','zelle_income','cash_income','transfer','other','zelle_sent','cash_withdrawal','deposit','cash_deposit')", "default": "other", "notNull": True},
        "subcategory": {"type": "varchar(100)"},
        "reference": {"type": "varchar(255)"},
        "plaidAmount": {"type": "decimal(12,2)"},
        "balanceAfter": {"type": "decimal(14,2)"},
        "isReconciled": {"type": "boolean", "default": False},
        "notes": {"type": "text"},
        "importedFrom": {"type": "varchar(50)"},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "subscriptions": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "userId": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
        "stripeCustomerId": {"type": "varchar(255)"},
        "stripeSubscriptionId": {"type": "varchar(255)"},
        "stripePriceId": {"type": "varchar(255)"},
        "plan": {"type": "enum('monthly','annual')", "notNull": True},
        "status": {"type": "enum('active','cancelled','past_due','unpaid','trialing')", "default": "active", "notNull": True},
        "currentPeriodStart": {"type": "timestamp"},
        "currentPeriodEnd": {"type": "timestamp"},
        "cancelAtPeriodEnd": {"type": "boolean", "default": False},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "updatedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "subscriptionPayments": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "userId": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
        "subscriptionId": {"type": "bigint unsigned", "fk": "subscriptions.id"},
        "stripePaymentIntentId": {"type": "varchar(255)"},
        "stripeInvoiceId": {"type": "varchar(255)"},
        "amount": {"type": "decimal(10,2)", "notNull": True},
        "plan": {"type": "enum('monthly','annual')", "notNull": True},
        "status": {"type": "enum('succeeded','pending','failed')", "default": "pending", "notNull": True},
        "receiptUrl": {"type": "text"},
        "paidAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "companySettings": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "userId": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
        "companyName": {"type": "varchar(255)", "default": "Tu Placa"},
        "rif": {"type": "varchar(50)"},
        "address": {"type": "text"},
        "phone": {"type": "varchar(50)"},
        "email": {"type": "varchar(320)"},
        "zelleEmail": {"type": "varchar(320)"},
        "bankName": {"type": "varchar(100)"},
        "bankAccountNumber": {"type": "varchar(50)"},
        "taxRate": {"type": "decimal(5,2)", "default": "0.00"},
        "currency": {"type": "varchar(10)", "default": "USD"},
        "logo": {"type": "text"},
        "updatedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
    "cloverAccounts": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "userId": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
        "merchantId": {"type": "varchar(255)", "notNull": True},
        "merchantName": {"type": "varchar(255)"},
        "accessToken": {"type": "text"},
        "refreshToken": {"type": "text"},
        "deviceId": {"type": "varchar(255)"},
        "deviceName": {"type": "varchar(255)"},
        "tenderId": {"type": "varchar(255)"},
        "isActive": {"type": "boolean", "default": True},
        "connectedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "updatedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "lastSyncedAt": {"type": "timestamp"},
    },
    "cloverTransactions": {
        "id": {"type": "serial", "pk": True, "notNull": True},
        "userId": {"type": "bigint unsigned", "notNull": True, "fk": "users.id"},
        "cloverAccountId": {"type": "bigint unsigned", "fk": "cloverAccounts.id"},
        "saleId": {"type": "bigint unsigned", "fk": "sales.id"},
        "cloverPaymentId": {"type": "varchar(255)"},
        "cloverOrderId": {"type": "varchar(255)"},
        "amount": {"type": "decimal(12,2)", "notNull": True},
        "status": {"type": "enum('pending','processing','completed','failed','cancelled','refunded')", "default": "pending"},
        "cardLastFour": {"type": "varchar(4)"},
        "cardType": {"type": "varchar(50)"},
        "deviceName": {"type": "varchar(255)"},
        "receiptUrl": {"type": "text"},
        "notes": {"type": "text"},
        "createdAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
        "updatedAt": {"type": "timestamp", "default": "CURRENT_TIMESTAMP", "notNull": True},
    },
}


def normalize_mysql_type(data_type, column_type, is_nullable, column_default, extra):
    """Normaliza el tipo de MySQL para comparacion."""
    dt = data_type.lower()
    ct = column_type.lower()

    # Serial / auto_increment
    if extra and "auto_increment" in extra.lower():
        return "serial", True

    # Enums
    if dt == "enum":
        return ct, True

    # Varchar con length
    if dt == "varchar":
        import re
        m = re.search(r'varchar\((\d+)\)', ct)
        if m:
            return f"varchar({m.group(1)})", is_nullable == "YES"
        return "varchar", is_nullable == "YES"

    # Decimal con precision
    if dt == "decimal":
        import re
        m = re.search(r'decimal\((\d+),\s*(\d+)\)', ct)
        if m:
            return f"decimal({m.group(1)},{m.group(2)})", is_nullable == "YES"
        return "decimal", is_nullable == "YES"

    # Bigint unsigned
    if dt == "bigint" and "unsigned" in ct:
        return "bigint unsigned", is_nullable == "YES"

    # Int
    if dt == "int":
        return "int", is_nullable == "YES"

    # Timestamp / datetime
    if dt in ("timestamp", "datetime"):
        return "timestamp", is_nullable == "YES"

    # Date
    if dt == "date":
        return "date", is_nullable == "YES"

    # Time
    if dt == "time":
        return "time", is_nullable == "YES"

    # Text / longtext / mediumtext
    if dt in ("text", "longtext", "mediumtext", "tinytext"):
        return "text", is_nullable == "YES"

    # Boolean / tinyint(1)
    if dt == "tinyint" and "(1)" in ct:
        return "boolean", is_nullable == "YES"

    # Tinyint
    if dt == "tinyint":
        return "tinyint", is_nullable == "YES"

    return ct, is_nullable == "YES"


def get_db_schema(conn):
    """Obtiene el schema completo de la base de datos."""
    schema = {}
    with conn.cursor() as cur:
        # Obtener todas las tablas
        cur.execute("""
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
        """, (DB_CONFIG["database"],))
        tables = [row["TABLE_NAME"] for row in cur.fetchall()]

        for table in tables:
            cur.execute("""
                SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE,
                       COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                ORDER BY ORDINAL_POSITION
            """, (DB_CONFIG["database"], table))
            columns = {}
            for row in cur.fetchall():
                col_name = row["COLUMN_NAME"]
                col_type, nullable = normalize_mysql_type(
                    row["DATA_TYPE"], row["COLUMN_TYPE"],
                    row["IS_NULLABLE"], row["COLUMN_DEFAULT"], row["EXTRA"]
                )
                columns[col_name] = {
                    "type": col_type,
                    "nullable": nullable,
                    "default": row["COLUMN_DEFAULT"],
                    "extra": row["EXTRA"],
                }
            schema[table] = columns
    return schema


def compare_schemas(drizzle, db):
    """Compara el schema de Drizzle con el de la DB y genera discrepancias."""
    report = {
        "missing_tables": [],
        "extra_tables": [],
        "table_comparisons": {},
    }

    drizzle_tables = set(drizzle.keys())
    db_tables = set(db.keys())

    report["missing_tables"] = sorted(list(drizzle_tables - db_tables))
    report["extra_tables"] = sorted(list(db_tables - drizzle_tables))

    for table in sorted(drizzle_tables & db_tables):
        d_cols = drizzle[table]
        db_cols = db[table]
        d_col_names = set(d_cols.keys())
        db_col_names = set(db_cols.keys())

        comparison = {
            "missing_columns": [],
            "extra_columns": [],
            "type_mismatches": [],
            "null_mismatches": [],
            "default_mismatches": [],
        }

        for col in sorted(d_col_names - db_col_names):
            comparison["missing_columns"].append({
                "column": col,
                "expected": d_cols[col],
            })

        for col in sorted(db_col_names - d_col_names):
            comparison["extra_columns"].append({
                "column": col,
                "found": db_cols[col],
            })

        for col in sorted(d_col_names & db_col_names):
            d_info = d_cols[col]
            db_info = db_cols[col]

            # Comparar tipos (ignorando case)
            expected_type = d_info.get("type", "").lower().replace(" ", "")
            actual_type = db_info.get("type", "").lower().replace(" ", "")

            # Normalizar algunos tipos equivalentes
            if expected_type == "serial" and actual_type == "bigintunsigned":
                pass  # serial en MySQL es bigint unsigned auto_increment
            elif expected_type != actual_type:
                comparison["type_mismatches"].append({
                    "column": col,
                    "expected": d_info["type"],
                    "actual": db_info["type"],
                })

            # Comparar nullable
            d_not_null = d_info.get("notNull", False)
            db_nullable = db_info.get("nullable", True)
            if d_not_null and db_nullable:
                comparison["null_mismatches"].append({
                    "column": col,
                    "expected": "NOT NULL",
                    "actual": "NULLABLE",
                })
            elif not d_not_null and not db_nullable:
                comparison["null_mismatches"].append({
                    "column": col,
                    "expected": "NULLABLE",
                    "actual": "NOT NULL",
                })

        has_issues = (
            comparison["missing_columns"]
            or comparison["extra_columns"]
            or comparison["type_mismatches"]
            or comparison["null_mismatches"]
            or comparison["default_mismatches"]
        )

        if has_issues:
            report["table_comparisons"][table] = comparison

    return report


def generate_sql_fixes(report, drizzle_schema, db_schema):
    """Genera script SQL para arreglar discrepancias."""
    sql_lines = ["-- SQL Fix Script generated by DB Audit", "-- USE WITH CAUTION - BACKUP FIRST!", ""]

    # Tablas faltantes
    for table in report["missing_tables"]:
        sql_lines.append(f"-- TABLE MISSING: {table}")
        sql_lines.append(f"-- CREATE TABLE {table} (...) -- Must be created manually based on schema.ts")
        sql_lines.append("")

    # Columnas faltantes
    for table, comp in report["table_comparisons"].items():
        for item in comp["missing_columns"]:
            col = item["column"]
            info = item["expected"]
            col_type = info.get("type", "VARCHAR(255)")
            not_null = "NOT NULL" if info.get("notNull") else ""
            default = ""
            if "default" in info and info["default"] is not None:
                if isinstance(info["default"], str):
                    default = f"DEFAULT '{info['default']}'"
                else:
                    default = f"DEFAULT {info['default']}"
            sql_lines.append(f"ALTER TABLE `{table}` ADD COLUMN `{col}` {col_type} {not_null} {default};")
        if comp["missing_columns"]:
            sql_lines.append("")

    # Columnas de mas
    for table, comp in report["table_comparisons"].items():
        for item in comp["extra_columns"]:
            col = item["column"]
            sql_lines.append(f"-- ALTER TABLE `{table}` DROP COLUMN `{col}`; -- EXTRA COLUMN (review before dropping)")
        if comp["extra_columns"]:
            sql_lines.append("")

    # Type mismatches
    for table, comp in report["table_comparisons"].items():
        for item in comp["type_mismatches"]:
            col = item["column"]
            expected = item["expected"]
            sql_lines.append(f"-- ALTER TABLE `{table}` MODIFY COLUMN `{col}` {expected}; -- TYPE MISMATCH (review data first)")
        if comp["type_mismatches"]:
            sql_lines.append("")

    # Null mismatches
    for table, comp in report["table_comparisons"].items():
        for item in comp["null_mismatches"]:
            col = item["column"]
            expected = item["expected"]
            sql_lines.append(f"-- ALTER TABLE `{table}` MODIFY COLUMN `{col}` ... {expected}; -- NULL MISMATCH (review data first)")
        if comp["null_mismatches"]:
            sql_lines.append("")

    return "\n".join(sql_lines)


def main():
    print("=" * 70)
    print("AUDITORIA DE BASE DE DATOS: Drizzle Schema vs MySQL Railway")
    print("=" * 70)
    print()

    conn = pymysql.connect(**DB_CONFIG)
    try:
        print("Conectando a la base de datos...")
        db_schema = get_db_schema(conn)
        print(f"Tablas encontradas en la DB: {len(db_schema)}")
        print(f"Tablas definidas en Drizzle: {len(DRIZZLE_SCHEMA)}")
        print()

        report = compare_schemas(DRIZZLE_SCHEMA, db_schema)

        # Imprimir reporte
        print("-" * 70)
        print("RESULTADOS DE LA AUDITORIA")
        print("-" * 70)
        print()

        # Tablas faltantes
        if report["missing_tables"]:
            print(f"[X] TABLAS FALTANTES EN LA DB ({len(report['missing_tables'])}):")
            for t in report["missing_tables"]:
                print(f"   - {t}")
            print()
        else:
            print("[OK] Todas las tablas de Drizzle existen en la DB")
            print()

        # Tablas extra
        if report["extra_tables"]:
            print(f"[!] TABLAS EXTRA EN LA DB (no en Drizzle) ({len(report['extra_tables'])}):")
            for t in report["extra_tables"]:
                print(f"   - {t}")
            print()
        else:
            print("[OK] No hay tablas extra en la DB")
            print()

        # Comparaciones por tabla
        total_issues = 0
        for table, comp in sorted(report["table_comparisons"].items()):
            issues = (
                len(comp["missing_columns"])
                + len(comp["extra_columns"])
                + len(comp["type_mismatches"])
                + len(comp["null_mismatches"])
            )
            total_issues += issues
            if issues > 0:
                print(f"[>] TABLA: {table} ({issues} discrepancias)")
                if comp["missing_columns"]:
                    print(f"   [X] Columnas faltantes:")
                    for item in comp["missing_columns"]:
                        print(f"      - {item['column']} ({item['expected']['type']})")
                if comp["extra_columns"]:
                    print(f"   [!] Columnas de mas:")
                    for item in comp["extra_columns"]:
                        print(f"      - {item['column']} ({item['found']['type']})")
                if comp["type_mismatches"]:
                    print(f"   [#] Type mismatches:")
                    for item in comp["type_mismatches"]:
                        print(f"      - {item['column']}: esperado={item['expected']}, actual={item['actual']}")
                if comp["null_mismatches"]:
                    print(f"   [@] Null mismatches:")
                    for item in comp["null_mismatches"]:
                        print(f"      - {item['column']}: esperado={item['expected']}, actual={item['actual']}")
                print()

        # Tablas sin problemas
        all_tables = set(DRIZZLE_SCHEMA.keys()) & set(db_schema.keys())
        problem_tables = set(report["table_comparisons"].keys())
        good_tables = all_tables - problem_tables
        if good_tables:
            print(f"[OK] Tablas sin discrepancias ({len(good_tables)}):")
            for t in sorted(good_tables):
                print(f"   - {t}")
            print()

        print("-" * 70)
        print(f"RESUMEN: {total_issues} discrepancias totales en {len(report['table_comparisons'])} tablas")
        print(f"         {len(report['missing_tables'])} tablas faltantes")
        print(f"         {len(report['extra_tables'])} tablas extra")
        print("-" * 70)

        # Generar SQL fixes
        sql_script = generate_sql_fixes(report, DRIZZLE_SCHEMA, db_schema)
        with open("db_audit_fixes.sql", "w", encoding="utf-8") as f:
            f.write(sql_script)
        print()
        print("Script SQL generado: db_audit_fixes.sql")

        # Guardar reporte JSON
        with open("db_audit_report.json", "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, default=str)
        print("Reporte JSON guardado: db_audit_report.json")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
