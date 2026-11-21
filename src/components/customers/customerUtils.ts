// Shared bits for Clientes (src/pages/Customers.tsx) and its pieces.
import { looksLikeEmail, mailtoLink, whatsappLink } from "../../../api/lib/ventas";

/** A row from customers.list (only the fields the page uses). */
export type Customer = {
  id: number;
  name: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes?: string | null;
  createdAt: string | Date;
};

/** The form fields customers.create / customers.update receive. */
export type CustomerForm = { name: string; lastName: string; email: string; phone: string; address: string; notes: string };

export const fullName = (c: Pick<Customer, "name" | "lastName">) => `${c.name}${c.lastName ? ` ${c.lastName}` : ""}`;

export const firstName = (c: Pick<Customer, "name">) => c.name.trim().split(/\s+/)[0] ?? c.name;

/** Matches a search against name, last name, full name, phone (digits too) and email. */
export function matchesSearch(c: Pick<Customer, "name" | "lastName" | "email" | "phone">, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  const hay = [c.name, c.lastName ?? "", fullName(c), c.email ?? "", c.phone ?? ""].map((s) => s.toLowerCase());
  if (hay.some((s) => s.includes(q))) return true;
  return digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits);
}

/**
 * Where a message to this client goes: WhatsApp when there's a phone, else their email.
 * Null when there's neither (then the button isn't shown).
 */
export function messageLink(c: { phone: string | null; email: string | null }, text: string, subject: string): string | null {
  if ((c.phone ?? "").replace(/\D/g, "").length >= 7) return whatsappLink(c.phone, text);
  if (looksLikeEmail(c.email)) return mailtoLink(c.email, subject, text);
  return null;
}
