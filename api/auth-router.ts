import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, passwordResetCodes } from "@db/schema";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signLocalToken, LOCAL_AUTH_COOKIE } from "./local-auth";
import { setCookie } from "hono/cookie";

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false;
  }
  
  record.count++;
  return true;
}

function getRateLimitHeaders(key: string, maxRequests: number): { remaining: number; resetAt: number } {
  const record = rateLimitMap.get(key);
  if (!record) return { remaining: maxRequests, resetAt: Date.now() + 60000 };
  return { remaining: Math.max(0, maxRequests - record.count), resetAt: record.resetAt };
}

function generateResetCode(): string {
  const crypto = require("crypto");
  return crypto.randomInt(100000, 999999).toString();
}

export const authRouter = createRouter({
  // ── Register ──
  register: publicQuery
    .input(z.object({
      email: z.string().email("Email invalido"),
      password: z.string().min(6, "Minimo 6 caracteres"),
      name: z.string().min(1, "Nombre requerido"),
      mode: z.enum(["business", "personal"]).default("business"),
    }))
    .mutation(async ({ input, ctx }) => {
      // Rate limit disabled for testing
      // if (!checkRateLimit(`register:${input.email}`, 5, 60 * 60 * 1000)) {
      //   return { success: false, error: "Demasiados intentos de registro. Intenta mas tarde." };
      // }
      const db = getDb();
      const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (existing.length > 0) {
        return { success: false, error: "Ya existe una cuenta con este email" };
      }
      const hashedPassword = await bcrypt.hash(input.password, 10);
      const isPersonal = input.mode === "personal";
      const result = await db.insert(users).values({
        email: input.email,
        password: hashedPassword,
        name: input.name,
        role: "user",
        hasPersonalMode: isPersonal || true, // Both modes get personal access
        modePreference: input.mode,
      });
      const userId = Number(result[0].insertId);
      const token = await signLocalToken(String(userId), input.email);
      // Set HttpOnly cookie
      ctx.resHeaders.set("Set-Cookie", `${LOCAL_AUTH_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`);
      return {
        success: true,
        token,
        user: { id: userId, email: input.email, name: input.name, modePreference: input.mode },
      };
    }),

  // ── Login ──
  login: publicQuery
    .input(z.object({
      email: z.string().email("Email invalido"),
      password: z.string().min(1, "Contrasena requerida"),
      mode: z.enum(["business", "personal"]).default("business"),
    }))
    .mutation(async ({ input, ctx }) => {
      // Rate limit disabled for testing
      // if (!checkRateLimit(`login:${input.email}`, 10, 15 * 60 * 1000)) {
      //   return { success: false, error: "Demasiados intentos de login. Intenta mas tarde." };
      // }
      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (rows.length === 0) {
        return { success: false, error: "Email o contrasena incorrectos" };
      }
      const user = rows[0];
      if (!user.password) {
        return { success: false, error: "Esta cuenta usa login social" };
      }
      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) {
        return { success: false, error: "Email o contrasena incorrectos" };
      }

      // Validate mode: users can only login with their registered mode
      const userMode = user.modePreference || "business";
      if (input.mode === "personal" && userMode !== "personal") {
        return { success: false, error: "Esta cuenta no tiene acceso al modo Personal. Registrate como Personal para acceder." };
      }

      await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
      const token = await signLocalToken(String(user.id), user.email || "");
      // Set HttpOnly cookie
      ctx.resHeaders.set("Set-Cookie", `${LOCAL_AUTH_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`);
      return {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          hasPersonalMode: user.hasPersonalMode,
          modePreference: userMode,
        },
      };
    }),

  // ── Forgot Password (send code) ──
  forgotPassword: publicQuery
    .input(z.object({
      email: z.string().email("Email invalido"),
    }))
    .mutation(async ({ input }) => {
      // Rate limit disabled for testing
      // if (!checkRateLimit(`forgot:${input.email}`, 3, 60 * 60 * 1000)) {
      //   return { success: false, error: "Demasiados intentos. Intenta mas tarde." };
      // }
      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (rows.length === 0) {
        return { success: false, error: "No existe una cuenta con este email" };
      }
      // Generate code
      const code = generateResetCode();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 min
      // Mark previous codes as used
      await db.update(passwordResetCodes).set({ used: true }).where(eq(passwordResetCodes.email, input.email));
      // Insert new code
      await db.insert(passwordResetCodes).values({
        email: input.email,
        code,
        expiresAt,
      });
      // TODO: Send email with code
      // For now, return code in dev mode
      
      return { success: true, message: "Codigo enviado a tu correo" };
    }),

  // ── Verify Code ──
  verifyCode: publicQuery
    .input(z.object({
      email: z.string().email(),
      code: z.string().length(6, "Codigo de 6 digitos"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const now = new Date();
      const rows = await db.select().from(passwordResetCodes)
        .where(
          and(
            eq(passwordResetCodes.email, input.email),
            eq(passwordResetCodes.code, input.code),
            eq(passwordResetCodes.used, false),
            gt(passwordResetCodes.expiresAt, now),
          )
        )
        .limit(1);
      if (rows.length === 0) {
        return { success: false, error: "Codigo invalido o expirado" };
      }
      return { success: true, message: "Codigo verificado" };
    }),

  // ── Reset Password ──
  resetPassword: publicQuery
    .input(z.object({
      email: z.string().email(),
      code: z.string().length(6),
      newPassword: z.string().min(6, "Minimo 6 caracteres"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const now = new Date();
      // Verify code first
      const codeRows = await db.select().from(passwordResetCodes)
        .where(
          and(
            eq(passwordResetCodes.email, input.email),
            eq(passwordResetCodes.code, input.code),
            eq(passwordResetCodes.used, false),
            gt(passwordResetCodes.expiresAt, now),
          )
        )
        .limit(1);
      if (codeRows.length === 0) {
        return { success: false, error: "Codigo invalido o expirado" };
      }
      // Hash new password
      const hashedPassword = await bcrypt.hash(input.newPassword, 10);
      // Update user
      await db.update(users).set({ password: hashedPassword }).where(eq(users.email, input.email));
      // Mark code as used
      await db.update(passwordResetCodes).set({ used: true }).where(eq(passwordResetCodes.id, codeRows[0].id));
      return { success: true, message: "Contrasena actualizada" };
    }),

  // ── Me (get current user) ──
  me: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      avatar: users.avatar,
    }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    return rows[0] || null;
  }),

  // ── Logout ──
  logout: authedQuery.mutation(async ({ ctx }) => {
    // Clear the cookie
    ctx.resHeaders.set("Set-Cookie", `${LOCAL_AUTH_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
    return { success: true };
  }),

  // ── Make Admin (protected by setup secret) ──
  // Use this endpoint ONCE to promote Angel Tosta (or any user) to admin.
  // Requires ADMIN_SETUP_SECRET env var to be set.
  makeAdmin: publicQuery
    .input(z.object({
      email: z.string().email("Email invalido"),
      setupKey: z.string().min(1, "Setup key requerida"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Step 1: Verify the setup key matches the env var
      const expectedKey = process.env.ADMIN_SETUP_SECRET;
      if (!expectedKey || expectedKey.length < 8) {
        return { success: false, error: "ADMIN_SETUP_SECRET no configurada en el servidor. Contacta al desarrollador." };
      }
      if (input.setupKey !== expectedKey) {
        return { success: false, error: "Setup key incorrecta" };
      }

      // Step 2: Find the user
      const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (rows.length === 0) {
        return { success: false, error: `Usuario con email ${input.email} no encontrado. Debe registrarse primero.` };
      }

      const user = rows[0];

      // Step 3: Already admin?
      if (user.role === "admin") {
        return { success: true, message: `${user.name || input.email} ya es administrador`, wasAlreadyAdmin: true };
      }

      // Step 4: Promote to admin
      await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));

      return {
        success: true,
        message: `${user.name || input.email} ahora es administrador`,
        userId: user.id,
        email: input.email,
        role: "admin",
      };
    }),
});
