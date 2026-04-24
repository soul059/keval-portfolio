import { Router } from "express";
import { AnalyticsEventModel } from "../models/Analytics.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const safeNumber = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

router.get(
  "/summary",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [totalEvents, uniqueSessions, eventTypes, topCommands] = await Promise.all([
      AnalyticsEventModel.countDocuments(),
      AnalyticsEventModel.distinct("sessionId").then((rows) => rows.length),
      AnalyticsEventModel.aggregate([{ $group: { _id: "$eventType", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      AnalyticsEventModel.aggregate([
        { $match: { command: { $ne: null } } },
        { $group: { _id: "$command", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 }
      ])
    ]);

    res.json({ totalEvents, uniqueSessions, eventTypes, topCommands });
  })
);

router.get(
  "/events",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const limit = Math.min(safeNumber(req.query.limit, 100), 500);
    const events = await AnalyticsEventModel.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ events });
  })
);

export default router;
