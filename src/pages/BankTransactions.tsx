import { Navigate } from "react-router";

/** The old "all bank transactions" list now lives in Movimientos (search, filters and Revisar). */
export default function BankTransactions() {
  return <Navigate to="/transactions" replace />;
}
