import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  revokeToken,
  isRevoked,
  BCRYPT_COST,
  PASSWORD_MIN_LENGTH,
  COOKIE_NAME,
} from '../../../backend/src/lib/auth';

describe('lib/auth', () => {
  it('exposes the documented constants', () => {
    expect(BCRYPT_COST).toBe(12);
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(COOKIE_NAME).toBe('roots_token');
  });

  describe('hashPassword + verifyPassword', () => {
    it('round-trips a correct password', async () => {
      const hash = await hashPassword('mypassword123');
      expect(await verifyPassword('mypassword123', hash)).toBe(true);
    });

    it('rejects a wrong password', async () => {
      const hash = await hashPassword('mypassword123');
      expect(await verifyPassword('wrong', hash)).toBe(false);
    });

    it('produces different hashes for the same password (salt)', async () => {
      const a = await hashPassword('same');
      const b = await hashPassword('same');
      expect(a).not.toBe(b);
    });
  });

  describe('signToken + verifyToken', () => {
    it('round-trips payload claims', () => {
      const { token } = signToken({ sub: 'u1', username: 'alice', role: 'admin' });
      const decoded = verifyToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe('u1');
      expect(decoded?.username).toBe('alice');
      expect(decoded?.role).toBe('admin');
      expect(typeof decoded?.jti).toBe('string');
    });

    it('returns null for a malformed token', () => {
      expect(verifyToken('not-a-jwt')).toBeNull();
    });

    it('returns null for a token signed with a different secret', () => {
      const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
      const stranger = jwt.sign(
        { sub: 'x', username: 'x', role: 'admin', jti: 'x' },
        'other-secret',
        { expiresIn: '1h' },
      );
      expect(verifyToken(stranger)).toBeNull();
    });

    it('returns null once the jti has been revoked', () => {
      const { token, jti } = signToken({ sub: 'u1', username: 'a', role: 'admin' });
      expect(verifyToken(token)).not.toBeNull();
      revokeToken(jti);
      expect(isRevoked(jti)).toBe(true);
      expect(verifyToken(token)).toBeNull();
    });

    it('isRevoked returns false for unknown / undefined jti', () => {
      expect(isRevoked(undefined)).toBe(false);
      expect(isRevoked('never-issued')).toBe(false);
    });
  });
});
