import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@roots/shared';
import { COOKIE_NAME, verifyToken, type JwtPayload } from '../lib/auth.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = (req.cookies?.[COOKIE_NAME] ?? '') as string;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Chưa đăng nhập' });
    return;
  }
  req.user = payload;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Không có quyền thực hiện' });
      return;
    }
    next();
  };
}
