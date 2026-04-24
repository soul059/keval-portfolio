import { AuditLogModel } from "../models/AuditLog.js";

interface AuditInput {
  actorId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

export async function writeAuditLog(input: AuditInput) {
  await AuditLogModel.create({
    actorId: input.actorId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    meta: input.meta ?? {}
  });
}
