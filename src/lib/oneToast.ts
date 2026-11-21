// One notification at a time: a new one closes whatever is on screen, so they never pile up (the ones behind
// used to stack up blank) and an old one never comes back after the new one goes. A notification updated by
// its own id (loading → done) keeps its place and just changes.
import { toast } from "sonner";

type Fn = (...args: unknown[]) => string | number;
const KINDS = ["success", "error", "info", "warning", "message", "loading", "custom"] as const;
let installed = false;

/** Called once at startup (main.tsx): every toast.success / error / … closes the previous one first. */
export function oneToastAtATime(): void {
  if (installed) return;
  installed = true;
  const methods = toast as unknown as Record<(typeof KINDS)[number], Fn>;
  for (const kind of KINDS) {
    const original = methods[kind].bind(toast) as Fn;
    methods[kind] = (...args: unknown[]) => {
      const keep = (args[1] as { id?: string | number } | undefined)?.id;
      for (const shown of toast.getToasts()) if (shown.id !== keep) toast.dismiss(shown.id);
      return original(...args);
    };
  }
}
