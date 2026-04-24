import mongoose, { Schema } from "mongoose";

const analyticsEventSchema = new Schema(
  {
    sessionId: { type: String, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    command: { type: String, default: null },
    path: { type: String, default: null },
    referrer: { type: String, default: null },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export const AnalyticsEventModel = mongoose.model("AnalyticsEvent", analyticsEventSchema);
