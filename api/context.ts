import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./kimi/auth";
import { authenticateLocalRequest } from "./local-auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  
  // Debug logging for auth troubleshooting
  const authHeader = opts.req.headers.get("x-auth-token");
  const cookieHeader = opts.req.headers.get("cookie");
  if (authHeader || cookieHeader?.includes("local_auth_token")) {
    console.log("[auth] Headers present - x-auth-token:", authHeader ? "yes" : "no", "cookie:", cookieHeader ? "yes" : "no");
  }
  
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
  
  return ctx;
}
