// Shared bits for the Clientes page (src/pages/Customers.tsx) and its dialogs.

/** A row from customers.list (only the fields the page uses). */
export type Customer = {
  id: number;
  name: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string | Date;
};

/** What the Excel importer sends to customers.importExcel, one per row. */
export type ImportRow = { name: string; lastName: string; email: string; phone: string; address: string; notes: string };

/** The form fields customers.create / customers.update receive. */
export type CustomerForm = { name: string; lastName: string; email: string; phone: string; address: string };

export const fullName = (c: Pick<Customer, "name" | "lastName">) => `${c.name}${c.lastName ? ` ${c.lastName}` : ""}`;

export const initials = (c: Pick<Customer, "name" | "lastName">) =>
  `${c.name.trim().charAt(0)}${(c.lastName ?? "").trim().charAt(0)}`.toUpperCase() || "?";

/** $1,234.50, with a real minus sign for negatives. */
export const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Matches a search against name, last name, full name, phone (digits too) and email. */
export function matchesSearch(c: Customer, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  const hay = [c.name, c.lastName ?? "", fullName(c), c.email ?? "", c.phone ?? ""].map((s) => s.toLowerCase());
  if (hay.some((s) => s.includes(q))) return true;
  return digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits);
}
