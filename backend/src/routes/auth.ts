import { Router } from "express";
import { z } from "zod";
import { UserModel } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { compareToken, compareValue, decodeTokenExpiryMs, hashToken } from "../utils/security.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";

const router = Router();

const loginSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9._-]+$/i),
  password: z.string().min(8).max(128)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const normalizedUsername = body.username.toLowerCase();
    const user = await UserModel.findOne({ username: normalizedUsername, role: "admin", isActive: true });
    if (!user) {
      res.status(401).json({ message: "Invalid credentials." });
      return;
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      res.status(423).json({ message: "Account temporarily locked due to failed login attempts." });
      return;
    }

    const validPassword = await compareValue(body.password, user.passwordHash);
    if (!validPassword) {
      user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      res.status(401).json({ message: "Invalid credentials." });
      return;
    }

    const payload = { userId: String(user._id), role: "admin" as const };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    user.refreshTokenHash = await hashToken(refreshToken);
    user.lastLoginAt = new Date();
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    res.json({
      accessToken,
      refreshToken,
      expiresAt: decodeTokenExpiryMs(accessToken),
      user: { id: String(user._id), username: user.username, role: user.role }
    });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const body = refreshSchema.parse(req.body);
    const payload = verifyRefreshToken(body.refreshToken);
    const user = await UserModel.findOne({ _id: payload.userId, role: "admin", isActive: true });
    if (!user || !user.refreshTokenHash) {
      res.status(401).json({ message: "Invalid refresh token." });
      return;
    }

    const validToken = await compareToken(body.refreshToken, user.refreshTokenHash);
    if (!validToken) {
      res.status(401).json({ message: "Invalid refresh token." });
      return;
    }

    const nextPayload = { userId: String(user._id), role: "admin" as const };
    const accessToken = signAccessToken(nextPayload);
    const refreshToken = signRefreshToken(nextPayload);
    user.refreshTokenHash = await hashToken(refreshToken);
    await user.save();

    res.json({
      accessToken,
      refreshToken,
      expiresAt: decodeTokenExpiryMs(accessToken)
    });
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const body = refreshSchema.parse(req.body);
    try {
      const payload = verifyRefreshToken(body.refreshToken);
      const user = await UserModel.findById(payload.userId);
      if (user) {
        user.refreshTokenHash = null;
        await user.save();
      }
    } catch {
      // Keep logout idempotent.
    }

    res.status(204).send();
  })
);

export default router;
