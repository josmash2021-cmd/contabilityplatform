import { describe, expect, it } from "vitest";
import { TAX_STEP } from "@contracts/taxRules";
import { mailTracker, taxStepMail, type StepMailInfo } from "./taxMail";

const base: StepMailInfo = { to: "maria@example.com", lang: "es", firstName: "María", preparer: "Josué", mode: "personal", refund: true, owe: false, deadline: "15 de abril de 2027" };

describe("the step emails", () => {
  it("has one for every step a client cares about, in their language", () => {
    const subjects = [0, 1, 2, 3, 4, 5, 6, 7].map((s) => taxStepMail(s, base)?.subject);
    expect(subjects).toEqual([
      "Recibimos tus documentos", "Josué está revisando tus documentos", "Josué está preparando tu declaración", "Tu declaración está lista para firmar",
      "Presentamos tu declaración", "El IRS aceptó tu declaración", "Tu reembolso va en camino", "Tu reembolso ya llegó",
    ]);
    expect(taxStepMail(TAX_STEP.sign, { ...base, lang: "en" })?.subject).toBe("Your return is ready to sign");
  });

  it("greets by first name, shows the step, and links to the app", () => {
    const m = taxStepMail(TAX_STEP.sign, base)!;
    expect(m.html).toContain("Hola María,");
    expect(m.html).toContain("Paso 4 de 8 · Firma");
    expect(m.html).toContain("/personal/taxes");
    expect(m.html).toContain("Revisar y firmar");
    expect(m.text).toContain("En papel desde tu casa");
    expect(taxStepMail(TAX_STEP.sign, { ...base, mode: "business" })!.html).toMatch(/\/taxes"/);
  });

  it("carries no amounts or personal data", () => {
    for (let s = 0; s < 8; s++) {
      const m = taxStepMail(s, base);
      if (m) expect(`${m.html}${m.text}`).not.toMatch(/\$\s?\d|\d{3}-\d{2}-\d{4}/);
    }
  });

  it("reminds to pay when something is owed, and sends no refund emails without a refund", () => {
    const owe = { ...base, refund: false, owe: true };
    expect(taxStepMail(TAX_STEP.accepted, owe)!.text).toContain("antes del 15 de abril de 2027");
    expect(taxStepMail(TAX_STEP.refundSent, owe)).toBeNull();
    expect(taxStepMail(TAX_STEP.deposited, owe)).toBeNull();
    const both = taxStepMail(TAX_STEP.accepted, { ...base, owe: true })!.text;
    expect(both).toContain("antes del 15 de abril de 2027");
    expect(both).toContain("sigue tu reembolso");
  });

  it("draws the 8 steps with the ones done in blue", () => {
    const t = mailTracker(2, "es");
    expect((t.match(/background:#2563eb/g) ?? []).length).toBe(3);
    expect((t.match(/background:#e2e8f0/g) ?? []).length).toBe(5);
  });
});
