// Recibos now lives in Gastos (src/pages/Expenses.tsx): /receipts opens Gastos with the receipt photo ready,
// so old links, bookmarks and the home shortcut keep working.
import { Navigate } from "react-router";

export default function Receipts() {
  return <Navigate to="/expenses?photo=1" replace />;
}
