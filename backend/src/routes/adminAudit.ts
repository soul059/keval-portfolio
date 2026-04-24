import { Router } from "express";
import { AuditLogModel } from "../models/AuditLog.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const safeNumber = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const limit = Math.min(safeNumber(req.query.limit, 100), 500);
    const logs = await AuditLogModel.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("actorId", "username role")
      .lean();
    res.json({ logs });
  })
);

export default router;
