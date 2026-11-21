import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./kimi/auth";
import { authenticateLocalRequest } from "./local-auth";
import { langFromHeaders, type Lang } from "./lib/i18n";
import { resolveMembership, type TeamMemberCtx } from "./lib/teamContext";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  /** UI language of the caller, from the x-lang header. */
  lang: Lang;
  /**
   * Set when the logged-in person is on a team: \`user\` is then the team owner (whose data
   * the request works on) and this is who is really asking, with their role.
   */
  member?: TeamMemberCtx;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders, lang: langFromHeaders(opts.req.headers) };

  // Try OAuth first
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    // OAuth not available, try local auth
  }
  
  // Try local auth (email/password token)
  if (!ctx.user) {
    try {
      ctx.user = await authenticateLocalRequest(opts.req.headers);
    } catch {
      // No auth available
    }
  }
  
  // Team members work on the owner's data, limited by their role (api/middleware.ts).
  if (ctx.user) {
    const team = await resolveMembership(ctx.user);
    if (team) {
      ctx.member = team.member;
      ctx.user = team.owner;
    }
  }

  return ctx;
}
