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
    // A stale JWT (e.g. DB was reseeded but the browser still holds an old
    // cookie) can carry a `sub` that no longer matches a User row. Resolve
    // the FK to null instead of failing the insert with P2003.
    let userId: string | null = event.userId;
    if (userId) {
      const exists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!exists) userId = null;
    }
    await prisma.auditLog.create({
      data: {
        userId,
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
