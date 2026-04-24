import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { UserModel } from "../models/User.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ message: "Missing access token." });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await UserModel.findOne({ _id: payload.userId, role: "admin", isActive: true }).lean();
    if (!user) {
      res.status(401).json({ message: "Invalid or expired access token." });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired access token." });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ message: "Admin access required." });
    return;
  }
  next();
}
