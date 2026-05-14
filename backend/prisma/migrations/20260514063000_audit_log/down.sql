-- Rollback for 20260514063000_audit_log.
DROP INDEX IF EXISTS "AuditLog_action_idx";
DROP INDEX IF EXISTS "AuditLog_userId_idx";
DROP INDEX IF EXISTS "AuditLog_createdAt_idx";
DROP TABLE IF EXISTS "AuditLog";
