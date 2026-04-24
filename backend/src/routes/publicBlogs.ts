import { Router } from "express";
import { BlogModel } from "../models/Blog.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const blogs = await BlogModel.find({ status: "published" })
      .sort({ publishedAt: -1, createdAt: -1 })
      .select("title slug excerpt coverImage tags publishedAt createdAt updatedAt")
      .lean();
    res.json({ blogs });
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
