import mongoose, { Schema } from "mongoose";

const siteConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "active" },
    data: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

const configVersionSchema = new Schema(
  {
    data: { type: Schema.Types.Mixed, required: true },
    reason: { type: String, default: "manual-update" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

export const SiteConfigModel = mongoose.model("SiteConfig", siteConfigSchema);
export const ConfigVersionModel = mongoose.model("ConfigVersion", configVersionSchema);
