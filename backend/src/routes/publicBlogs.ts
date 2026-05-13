import { Router } from "express";
import { z } from "zod";
import { BlogModel } from "../models/Blog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { escapeRegExp } from "../utils/regex.js";

const router = Router();
const listSchema = z.object({
  search: z.string().min(1).max(100).optional(),
  tag: z.string().min(1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1)
});

function buildPublicFilter(query: z.infer<typeof listSchema>) {
  const filter: Record<string, unknown> = { status: "published" };
  if (query.search) {
    const searchTerm = escapeRegExp(query.search);
    filter.$or = [
      { title: { $regex: searchTerm, $options: "i" } },
      { slug: { $regex: searchTerm, $options: "i" } },
      { excerpt: { $regex: searchTerm, $options: "i" } },
      { tags: { $regex: searchTerm, $options: "i" } }
    ];
  }
  if (query.tag) {
    filter.tags = { $regex: `^${query.tag}$`, $options: "i" };
  }
  return filter;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listSchema.parse(req.query);
    const filter = buildPublicFilter(query);
    const skip = (query.page - 1) * query.limit;
    const [blogs, total] = await Promise.all([
      BlogModel.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .select("title slug excerpt coverImage tags publishedAt createdAt updatedAt")
        .skip(skip)
        .limit(query.limit)
        .lean(),
      BlogModel.countDocuments(filter)
    ]);
    res.json({ blogs, pagination: { total, page: query.page, limit: query.limit } });
  })
);

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const query = listSchema.parse(req.query);
    const filter = buildPublicFilter(query);
    const skip = (query.page - 1) * query.limit;
    const [blogs, total] = await Promise.all([
      BlogModel.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .select("title slug excerpt coverImage tags publishedAt createdAt updatedAt")
        .skip(skip)
        .limit(query.limit)
        .lean(),
      BlogModel.countDocuments(filter)
    ]);
    res.json({ blogs, pagination: { total, page: query.page, limit: query.limit } });
  })
);

router.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const blog = await BlogModel.findOne({ slug: req.params.slug, status: "published" }).lean();
    if (!blog) {
      res.status(404).json({ message: "Blog not found." });
      return;
    }
    res.json({ blog });
  })
);

export default router;
