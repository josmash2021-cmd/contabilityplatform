import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { memberCan } from "./lib/team";
import { maintenanceBlocks, maintenanceOn } from "./lib/maintenance";
import { msg } from "./lib/i18n";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  // Team members can only call what their role allows (api/lib/team.ts).
  if (ctx.member && !memberCan(ctx.member.role, opts.path, opts.type)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ctx.lang === "en" ? "Your team access doesn't include this." : "Tu acceso de equipo no incluye esto.",
    });
  }

  // Maintenance mode (Admin · Sistema): customers can look but not change anything until it's turned off.
  if (opts.type === "mutation" && maintenanceBlocks(opts.path, opts.type, ctx.user.role === "admin" && !ctx.member) && (await maintenanceOn())) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: msg(ctx.lang, "maintenance") });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    // A team member never gets the owner's role (e.g. admin).
    if (!ctx.user || ctx.member || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));
