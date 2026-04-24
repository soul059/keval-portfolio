import { Router } from "express";
import { z } from "zod";
import { SiteConfigModel, ConfigVersionModel } from "../models/SiteConfig.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";
import { writeAuditLog } from "../utils/audit.js";

const router = Router();

const updateSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  reason: z.string().min(1).default("manual-update")
});

router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const current = await SiteConfigModel.findOne({ key: "active" }).lean();
    res.json({ data: current?.data ?? null, updatedAt: current?.updatedAt ?? null });
  })
);

router.put(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const actorId = req.user!.userId;
    const previous = await SiteConfigModel.findOne({ key: "active" });
    const beforeData = previous?.data ?? null;

    const updated = await SiteConfigModel.findOneAndUpdate(
      { key: "active" },
      { data: body.data, updatedBy: actorId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await ConfigVersionModel.create({ data: body.data, reason: body.reason, updatedBy: actorId });
    await writeAuditLog({
      actorId,
      action: "config.update",
      entity: "SiteConfig",
      entityId: String(updated._id),
      before: beforeData,
      after: body.data,
      meta: { reason: body.reason }
    });

    res.json({ data: updated.data, updatedAt: updated.updatedAt });
  })
);

router.get(
  "/versions",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const versions = await ConfigVersionModel.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("updatedBy", "username role")
      .lean();
    res.json({ versions });
  })
);

export default router;
