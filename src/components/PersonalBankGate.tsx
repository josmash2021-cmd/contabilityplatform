interface PersonalBankGateProps {
  children: React.ReactNode;
}

/**
 * Personal mode does NOT require a bank connection.
 * Always shows content without any gates or overlays.
 */
export function PersonalBankGate({ children }: PersonalBankGateProps) {
  return <>{children}</>;
}
