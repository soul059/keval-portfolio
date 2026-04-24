import { Router } from "express";
import { z } from "zod";
import { AnalyticsEventModel } from "../models/Analytics.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { analyticsRateLimiter } from "../middlewares/rateLimit.js";

const router = Router();

const eventSchema = z.object({
  sessionId: z.string().min(8),
  eventType: z.string().min(1),
  command: z.string().optional(),
  path: z.string().optional(),
  referrer: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

router.post(
  "/event",
  analyticsRateLimiter,
  asyncHandler(async (req, res) => {
    const body = eventSchema.parse(req.body);
    await AnalyticsEventModel.create({
      ...body,
      userAgent: req.get("user-agent") ?? null,
      ip: req.ip
    });
    res.status(202).json({ accepted: true });
  })
);

export default router;
