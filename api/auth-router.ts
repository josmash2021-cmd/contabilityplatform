import { z } from "zod";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, passwordResetCodes } from "@db/schema";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signLocalToken, LOCAL_AUTH_COOKIE } from "./local-auth";
import { randomInt } from "node:crypto";
import { RateLimiter, normalizeEmail } from "./lib/security";

// ── Rate limits (per email) ──
// The reset code is only 6 digits: without an attempt limit it can be brute-forced
// in minutes, which allows taking over any account (including admins).
const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);       // 10 logins / 15 min
const forgotLimiter = new RateLimiter(3, 60 * 60 * 1000);       // 3 codes / hour
const resetAttemptLimiter = new RateLimiter(5, 30 * 60 * 1000); // 5 code guesses per issued code

const TOO_MANY_RESET_ATTEMPTS = "Demasiados intentos. Solicita un codigo nuevo.";

/** Burns every outstanding reset code for this email (after too many wrong guesses). */
async function invalidateResetCodes(email: string) {
  try {
    await getDb().update(passwordResetCodes).set({ used: true }).where(eq(passwordResetCodes.email, email));
  } catch (err) {
    console.error("[auth] failed to invalidate reset codes:", (err as Error).message);
  }
}

function generateResetCode(): string {
  return randomInt(100000, 1000000).toString();
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
      // Checked before any await so a batch of parallel requests can't bypass it.
      const loginKey = normalizeEmail(input.email);
      if (!loginLimiter.consume(loginKey)) {
        return { success: false, error: "Demasiados intentos de login. Intenta en 15 minutos." };
      }
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

      // AUTO-PROMOTE: Jhon Martinez is always admin
      const OWNER_EMAIL = "josmash2021@gmail.com";
      let effectiveRole = user.role;
      if (user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase() && user.role !== "admin") {
        await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
        effectiveRole = "admin";
      }

      loginLimiter.reset(loginKey);
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
          role: effectiveRole,
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
      const key = normalizeEmail(input.email);
      if (!forgotLimiter.consume(key)) {
        return { success: false as const, error: "Demasiados intentos. Intenta en una hora." };
      }
      // Same answer whether or not the account exists, so this can't be used to
      // discover which emails are registered.
      const genericOk = { success: true as const, message: "Si el correo esta registrado, recibiras un codigo" };
      const db = getDb();
      const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (rows.length === 0) {
        return genericOk;
      }
      // A fresh code gets a fresh set of guesses.
      resetAttemptLimiter.reset(key);
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
      // TODO: Send email with code (no email provider is wired up yet).

      return genericOk;
    }),

  // ── Verify Code ──
  verifyCode: publicQuery
    .input(z.object({
      email: z.string().email(),
      code: z.string().length(6, "Codigo de 6 digitos"),
    }))
    .mutation(async ({ input }) => {
      // Checked before any await so a batch of parallel guesses can't bypass it.
      if (!resetAttemptLimiter.consume(normalizeEmail(input.email))) {
        await invalidateResetCodes(input.email);
        return { success: false, error: TOO_MANY_RESET_ATTEMPTS };
      }
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
      const key = normalizeEmail(input.email);
      // Shares the attempt budget with verifyCode; checked before any await.
      if (!resetAttemptLimiter.consume(key)) {
        await invalidateResetCodes(input.email);
        return { success: false, error: TOO_MANY_RESET_ATTEMPTS };
      }
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
      resetAttemptLimiter.reset(key);
      loginLimiter.reset(key);
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
    const user = rows[0] || null;
    if (!user) return null;
    // Ensure owner always sees admin role
    const OWNER_EMAIL = "josmash2021@gmail.com";
    if (user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase() && user.role !== "admin") {
      await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
      user.role = "admin";
    }
    return user;
  }),

  // ── Logout ──
  // Public so the cookie is cleared even when the token is already expired/invalid.
  logout: publicQuery.mutation(async ({ ctx }) => {
    // Clear the cookie
    ctx.resHeaders.set("Set-Cookie", `${LOCAL_AUTH_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
    return { success: true };
  }),

  // ── Auto Promote Owner ──
  // Automatically promotes josmash2021@gmail.com to admin.
  // Called by frontend on app load when owner email is detected.
  autoPromoteOwner: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const OWNER_EMAIL = "josmash2021@gmail.com";
    const userEmail = ctx.user.email;

    if (!userEmail || userEmail.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
      return { success: false, error: "No autorizado" };
    }

    if (ctx.user.role === "admin") {
      return { success: true, message: "Ya eres administrador", wasAlreadyAdmin: true };
    }

    await db.update(users).set({ role: "admin" }).where(eq(users.id, ctx.user.id));
    return { success: true, message: "Ahora eres administrador", role: "admin" };
  }),

  // ── Make Admin ──
  // Promotes a user to admin role.
  // Jhon Martinez (josmash2021@gmail.com) is the designated owner/admin.
  // For the owner email: no setupKey required (direct promotion).
  // For any other email: requires ADMIN_SETUP_SECRET env var.
  makeAdmin: publicQuery
    .input(z.object({
      email: z.string().email("Email invalido"),
      setupKey: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      const OWNER_EMAIL = "josmash2021@gmail.com";
      const isOwner = input.email.toLowerCase() === OWNER_EMAIL.toLowerCase();

      // Step 1: For non-owner emails, verify the setup key
      if (!isOwner) {
        const expectedKey = process.env.ADMIN_SETUP_SECRET;
        if (!expectedKey || expectedKey.length < 8) {
          return { success: false, error: "ADMIN_SETUP_SECRET no configurada en el servidor." };
        }
        if (!input.setupKey || input.setupKey !== expectedKey) {
          return { success: false, error: "Setup key incorrecta o requerida para este usuario." };
        }
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
