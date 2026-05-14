import { prisma } from '../prisma.js';

interface AuditEvent {
  userId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  diff?: Record<string, unknown>;
}

// Append-only audit. Failures are logged but never break the caller — audit
// must not knock out the primary action it observes.
export async function writeAudit(event: AuditEvent): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: event.userId,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        diff: event.diff ? JSON.stringify(event.diff) : null,
      },
    });
  } catch (err) {
    console.error('[audit] write failed', err);
  }
}
