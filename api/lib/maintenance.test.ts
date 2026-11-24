import { describe, expect, it } from "vitest";
import { cleanMessage, maintenanceBlocks } from "./maintenance";

describe("maintenance mode", () => {
  it("customers can look but not change anything", () => {
    expect(maintenanceBlocks("customers.create", "mutation", false)).toBe(true);
    expect(maintenanceBlocks("tax.sendMessage", "mutation", false)).toBe(true);
    expect(maintenanceBlocks("dashboard.summary", "query", false)).toBe(false);
  });
  it("signing in and out still works", () => {
    expect(maintenanceBlocks("auth.login", "mutation", false)).toBe(false);
    expect(maintenanceBlocks("auth.logout", "mutation", false)).toBe(false);
  });
  it("the admin can do everything", () => {
    expect(maintenanceBlocks("customers.create", "mutation", true)).toBe(false);
    expect(maintenanceBlocks("admin.toggleMaintenance", "mutation", true)).toBe(false);
  });
  it("the admin's message, or nothing (then each customer reads the default in their language)", () => {
    expect(cleanMessage("  Estamos actualizando los reportes.  ")).toBe("Estamos actualizando los reportes.");
    expect(cleanMessage("")).toBeNull();
    expect(cleanMessage(null)).toBeNull();
    // What the old screen saved by default (Spanish only) isn't a message the admin wrote.
    expect(cleanMessage("Estamos en mantenimiento. Volveremos pronto.")).toBeNull();
    expect(cleanMessage("x".repeat(400))?.length).toBe(300);
  });
});
