import { Router } from "express";
import { z } from "zod";
import { BlogModel } from "../models/Blog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";
import { writeAuditLog } from "../utils/audit.js";

const router = Router();

const blogInputSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  status: z.enum(["draft", "published"]).default("draft"),
  coverImage: z
    .object({
      url: z.string().url(),
      publicId: z.string().min(1)
    })
    .nullable()
    .optional(),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        publicId: z.string().min(1)
      })
    )
    .default([])
});
const listSchema = z.object({
  status: z.enum(["draft", "published"]).optional(),
  search: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1)
});

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = listSchema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: "i" } },
        { slug: { $regex: query.search, $options: "i" } },
        { tags: { $regex: query.search, $options: "i" } }
      ];
    }
    const skip = (query.page - 1) * query.limit;
    const [blogs, total] = await Promise.all([
      BlogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
      BlogModel.countDocuments(filter)
    ]);
    res.json({ blogs, pagination: { total, page: query.page, limit: query.limit } });
  })
);

router.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = blogInputSchema.parse(req.body);
    const actorId = req.user!.userId;
    const slug = normalizeSlug(body.slug || body.title);
    const publishedAt = body.status === "published" ? new Date() : null;

    const created = await BlogModel.create({
      ...body,
      slug,
      coverImage: body.coverImage ?? { url: null, publicId: null },
      authorId: actorId,
      publishedAt
    });

    await writeAuditLog({
      actorId,
      action: "blog.create",
      entity: "Blog",
      entityId: String(created._id),
      after: created.toObject()
    });

    res.status(201).json({ blog: created });
  })
);

router.put(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = blogInputSchema.parse(req.body);
    const actorId = req.user!.userId;
    const existing = await BlogModel.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ message: "Blog not found." });
      return;
    }

    const before = existing.toObject();
    existing.title = body.title;
    existing.slug = normalizeSlug(body.slug || body.title);
    existing.excerpt = body.excerpt;
    existing.content = body.content;
    existing.tags = body.tags;
    existing.status = body.status;
    existing.coverImage = body.coverImage ?? { url: null, publicId: null };
    existing.set("images", body.images);
    existing.publishedAt = body.status === "published" ? existing.publishedAt ?? new Date() : null;
    await existing.save();

    await writeAuditLog({
      actorId,
      action: "blog.update",
      entity: "Blog",
      entityId: String(existing._id),
      before,
      after: existing.toObject()
    });

    res.json({ blog: existing });
  })
);

router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const actorId = req.user!.userId;
    const existing = await BlogModel.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ message: "Blog not found." });
      return;
    }
    const before = existing.toObject();
    await existing.deleteOne();

    await writeAuditLog({
      actorId,
      action: "blog.delete",
      entity: "Blog",
      entityId: String(existing._id),
      before
    });

    res.status(204).send();
  })
);

export default router;
