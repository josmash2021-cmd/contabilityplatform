import * as jose from "jose";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import * as cookie from "cookie";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required");
}
const SECRET_KEY = new TextEncoder().encode(jwtSecret);

const LOCAL_AUTH_COOKIE = "local_auth_token";

export async function signLocalToken(userId: string, email: string): Promise<string> {
  return new jose.SignJWT({ sub: userId, email, type: "local" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET_KEY);
}

export async function verifyLocalToken(token: string) {
  try {
    const { payload } = await jose.jwtVerify(token, SECRET_KEY, { clockTolerance: 60 });
    return payload as { sub: string; email: string; type: string };
  } catch {
    return null;
  }
}

export async function authenticateLocalRequest(headers: Headers) {
  // Check cookie first (new secure way)
  const cookies = cookie.parse(headers.get("cookie") || "");
  const cookieToken = cookies[LOCAL_AUTH_COOKIE];
  if (cookieToken) {
    console.log("[auth] Found cookie token, verifying...");
    const claim = await verifyLocalToken(cookieToken);
    if (claim && claim.sub) {
      console.log("[auth] Cookie token valid, userId:", claim.sub);
      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.id, Number(claim.sub))).limit(1);
      if (rows[0]) return rows[0];
    } else {
      console.log("[auth] Cookie token invalid or expired");
    }
  }

  // Fallback: Check x-auth-token header (for migration/compatibility)
  const authHeader = headers.get("x-auth-token");
  if (authHeader) {
    console.log("[auth] Found x-auth-token header, verifying...");
    const claim = await verifyLocalToken(authHeader);
    if (claim && claim.sub) {
      console.log("[auth] Header token valid, userId:", claim.sub);
      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.id, Number(claim.sub))).limit(1);
      if (rows[0]) return rows[0];
    } else {
      console.log("[auth] Header token invalid or expired");
    }
  }

  // Also check Authorization: Bearer header
  const bearerHeader = headers.get("authorization");
  if (bearerHeader?.startsWith("Bearer ")) {
    const token = bearerHeader.slice(7);
    const claim = await verifyLocalToken(token);
    if (claim && claim.sub) {
      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.id, Number(claim.sub))).limit(1);
      if (rows[0]) return rows[0];
    }
  }

  throw new Error("No local auth token");
}

export { LOCAL_AUTH_COOKIE };
