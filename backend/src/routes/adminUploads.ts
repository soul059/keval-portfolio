import { Router } from "express";
import multer from "multer";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cloudinary } from "../config/cloudinary.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

router.post(
  "/image",
  requireAuth,
  requireAdmin,
  upload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "Image file is required." });
      return;
    }
    if (!allowedMimeTypes.has(req.file.mimetype)) {
      res.status(400).json({ message: "Only jpeg/png/webp/gif images are allowed." });
      return;
    }
    if (!cloudinary.config().cloud_name) {
      res.status(500).json({ message: "Cloudinary is not configured." });
      return;
    }

    const uploaded = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "keval-portfolio/blogs", resource_type: "image" },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Cloudinary upload failed."));
            return;
          }
          resolve(result as { secure_url: string; public_id: string });
        }
      );
      stream.end(req.file!.buffer);
    });

    res.status(201).json({ url: uploaded.secure_url, publicId: uploaded.public_id });
  })
);

export default router;
