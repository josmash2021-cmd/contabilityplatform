import { getDb } from "../api/queries/connection";
import { accounts, services, customers, companySettings, users } from "./schema";
import { eq } from "drizzle-orm";

async function seed() {
  const db = getDb();
  console.log("Seeding initial data...");

  // Create a default admin user if none exists
  let adminUser = await db.select().from(users).where(eq(users.email, "admin@tuplaca.com")).limit(1);
  let adminUserId: number;
  
  if (adminUser.length === 0) {
    const result = await db.insert(users).values({
      email: "admin@tuplaca.com",
      name: "Administrador",
      role: "admin",
      password: null, // OAuth only
    });
    adminUserId = Number(result[0].insertId);
    console.log("Admin user created with ID:", adminUserId);
  } else {
    adminUserId = adminUser[0].id;
    console.log("Using existing admin user ID:", adminUserId);
  }

  // Seed company settings for admin user
  const existingSettings = await db.select().from(companySettings).where(eq(companySettings.userId, adminUserId)).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(companySettings).values({ 
      userId: adminUserId,
      companyName: "Tu Placa", 
      currency: "USD" 
    });
    console.log("Company settings created");
  }

  // Seed chart of accounts for admin user
  const existingAccounts = await db.select().from(accounts).where(eq(accounts.userId, adminUserId)).limit(1);
  if (existingAccounts.length === 0) {
    // Insert parent accounts first, then get their IDs
    const parentAccounts = [
      { code: "1000", name: "Activos", type: "asset" as const },
      { code: "2000", name: "Pasivos", type: "liability" as const },
      { code: "3000", name: "Patrimonio", type: "equity" as const },
      { code: "4000", name: "Ingresos", type: "revenue" as const },
      { code: "5000", name: "Gastos", type: "expense" as const },
    ];
    
    const parentIds: Record<string, number> = {};
    for (const acc of parentAccounts) {
      const result = await db.insert(accounts).values({ ...acc, userId: adminUserId });
      parentIds[acc.code] = Number(result[0].insertId);
    }

    // Insert sub-accounts with correct parent IDs
    const subAccounts = [
      { code: "1100", name: "Efectivo y Equivalentes", type: "asset" as const, parentCode: "1000" },
      { code: "2000", name: "Cuentas por Pagar", type: "liability" as const, parentCode: "2000" },
      { code: "3100", name: "Capital Social", type: "equity" as const, parentCode: "3000" },
      { code: "3200", name: "Utilidades Retenidas", type: "equity" as const, parentCode: "3000" },
      { code: "4100", name: "Ventas de Servicios", type: "revenue" as const, parentCode: "4000" },
      { code: "5100", name: "Costo de Ventas", type: "expense" as const, parentCode: "5000" },
      { code: "5200", name: "Gastos Administrativos", type: "expense" as const, parentCode: "5000" },
      { code: "5300", name: "Gastos de Ventas", type: "expense" as const, parentCode: "5000" },
      { code: "5400", name: "Gastos de Personal", type: "expense" as const, parentCode: "5000" },
      { code: "5500", name: "Otros Gastos", type: "expense" as const, parentCode: "5000" },
    ];

    for (const acc of subAccounts) {
      await db.insert(accounts).values({
        userId: adminUserId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        parentId: parentIds[acc.parentCode],
      });
    }

    // Insert leaf accounts
    const leafAccounts = [
      { code: "1110", name: "Caja", type: "asset" as const, parentCode: "1100" },
      { code: "1120", name: "Banco", type: "asset" as const, parentCode: "1100" },
      { code: "1130", name: "Zelle", type: "asset" as const, parentCode: "1100" },
      { code: "1150", name: "Cuentas por Cobrar", type: "asset" as const, parentCode: "1100" },
    ];

    for (const acc of leafAccounts) {
      await db.insert(accounts).values({
        userId: adminUserId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        parentId: parentIds[acc.parentCode],
      });
    }

    console.log("Chart of accounts seeded");
  }

  // Seed services for admin user
  const existingServices = await db.select().from(services).where(eq(services.userId, adminUserId)).limit(1);
  if (existingServices.length === 0) {
    await db.insert(services).values([
      { userId: adminUserId, name: "Placa Personalizada", description: "Placa vehicular personalizada con diseño a eleccion", price: "25.00", cost: "10.00" },
      { userId: adminUserId, name: "Placa Estandar", description: "Placa vehicular estandar", price: "15.00", cost: "7.00" },
      { userId: adminUserId, name: "Placa Motocicleta", description: "Placa para motocicleta", price: "12.00", cost: "5.00" },
      { userId: adminUserId, name: "Servicio de Instalacion", description: "Instalacion profesional de placas", price: "10.00" },
      { userId: adminUserId, name: "Tramite de Documentos", description: "Gestion de documentos vehiculares", price: "30.00", cost: "5.00" },
      { userId: adminUserId, name: "Limpieza de Placa", description: "Servicio de limpieza y mantenimiento", price: "5.00" },
    ]);
    console.log("Services seeded");
  }

  // Seed customers for admin user
  const existingCustomers = await db.select().from(customers).where(eq(customers.userId, adminUserId)).limit(1);
  if (existingCustomers.length === 0) {
    await db.insert(customers).values([
      { userId: adminUserId, name: "General", email: "general@tuplaca.com", phone: "+58 000-000-0000", notes: "Cliente por defecto para ventas rapidas", clientType: "placas" },
      { userId: adminUserId, name: "Juan", lastName: "Perez", email: "juan.perez@email.com", phone: "+58 412-345-6789", zelleEmail: "juan.perez@email.com", carBrand: "Toyota", carModel: "Corolla", carYear: "2020", plateNumber: "ABC123", plateExpiryDate: new Date("2026-08-15"), clientType: "placas" },
      { userId: adminUserId, name: "Maria", lastName: "Garcia", email: "maria.garcia@email.com", phone: "+58 414-567-8901", carBrand: "Honda", carModel: "Civic", carYear: "2022", plateNumber: "XYZ789", plateExpiryDate: new Date("2026-12-01"), clientType: "placas" },
      { userId: adminUserId, name: "Carlos", lastName: "Rodriguez", email: "carlos.r@email.com", phone: "+58 416-789-0123", carBrand: "Ford", carModel: "Explorer", carYear: "2019", plateNumber: "DEF456", plateExpiryDate: new Date("2025-06-30"), clientType: "titulos" },
      { userId: adminUserId, name: "Ana", lastName: "Martinez", email: "ana.m@email.com", phone: "+58 426-123-4567", zelleEmail: "ana.m@email.com", carBrand: "Chevrolet", carModel: "Spark", carYear: "2021", plateNumber: "GHI321", plateExpiryDate: new Date("2026-03-20"), clientType: "placas" },
      { userId: adminUserId, name: "Pedro", lastName: "Sanchez", email: "pedro.s@email.com", phone: "+58 424-999-8888", carBrand: "Hyundai", carModel: "Tucson", carYear: "2023", plateNumber: "JKL654", plateExpiryDate: new Date("2027-01-10"), clientType: "placas" },
      { userId: adminUserId, name: "Laura", lastName: "Lopez", email: "laura.l@email.com", phone: "+58 412-777-6666", carBrand: "Kia", carModel: "Seltos", carYear: "2022", plateNumber: "MNO987", plateExpiryDate: new Date("2025-09-15"), clientType: "titulos" },
      { userId: adminUserId, name: "Roberto", lastName: "Fernandez", email: "roberto.f@email.com", phone: "+58 416-555-4444", zelleEmail: "roberto.f@email.com", carBrand: "Nissan", carModel: "Sentra", carYear: "2020", plateNumber: "PQR159", plateExpiryDate: new Date("2026-11-05"), clientType: "placas" },
      { userId: adminUserId, name: "Diana", lastName: "Castillo", email: "diana.c@email.com", phone: "+58 414-333-2222", carBrand: "Mazda", carModel: "CX-5", carYear: "2023", plateNumber: "STU753", plateExpiryDate: new Date("2027-04-18"), clientType: "placas" },
      { userId: adminUserId, name: "Miguel", lastName: "Torres", email: "miguel.t@email.com", phone: "+58 426-111-0000", carBrand: "Jeep", carModel: "Wrangler", carYear: "2021", plateNumber: "VWX246", plateExpiryDate: new Date("2025-07-22"), clientType: "titulos" },
      { userId: adminUserId, name: "Sofia", lastName: "Ramirez", email: "sofia.r@email.com", phone: "+58 412-888-7777", zelleEmail: "sofia.r@email.com", carBrand: "BMW", carModel: "X3", carYear: "2022", plateNumber: "YZA468", plateExpiryDate: new Date("2026-05-30"), clientType: "placas" },
      { userId: adminUserId, name: "Andres", lastName: "Morales", email: "andres.m@email.com", phone: "+58 424-666-5555", carBrand: "Mercedes", carModel: "GLA", carYear: "2023", plateNumber: "BCD135", plateExpiryDate: new Date("2027-02-14"), clientType: "placas" },
    ]);
    console.log("Customers seeded");
  }

  console.log("Seeding complete!");
}

seed().catch(console.error);
