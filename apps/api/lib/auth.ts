/**
 * Authentication & CORS helpers for Vercel serverless functions
 * Verifies Clerk session JWTs from the Authorization: Bearer <token> header
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';
import { looksLikeSaveKey, verifySaveKey } from './apiKeys.js';
import { initializeSchema } from './db.js';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://curio-omega-tawny.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

export function setCorsHeaders(
  req: VercelRequest,
  res: VercelResponse,
  methods = 'GET, POST, OPTIONS',
): void {
  const origin = req.headers.origin;
  const configuredOrigin = process.env.ALLOWED_ORIGIN;
  const allowedOrigins = configuredOrigin
    ? configuredOrigin.split(',').map(o => o.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;

  // Exact production/dev origins, plus this project's own Vercel preview deployments
  const isPreview = !!origin && /^https:\/\/curio-[a-z0-9-]+\.vercel\.app$/.test(origin);
  if (origin && (allowedOrigins.includes(origin) || isPreview)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
  }

  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export interface AuthOptions {
  /** Also accept a personal save key (curio_sk_...). Only for routes that save links. */
  allowSaveKey?: boolean;
}

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
  options: AuthOptions = {},
): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('[Auth] Missing CLERK_SECRET_KEY environment variable');
    res.status(500).json({ error: 'Server authentication is not configured' });
    return null;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  if (looksLikeSaveKey(token)) {
    if (!options.allowSaveKey) {
      res.status(403).json({ error: 'Save keys can only be used to save links' });
      return null;
    }
    try {
      await initializeSchema();
      const userId = await verifySaveKey(token);
      if (userId) return userId;
    } catch (error) {
      console.error('[Auth] Save key check failed:', error);
    }
    res.status(401).json({ error: 'Invalid or revoked save key' });
    return null;
  }

  try {
    const payload = await verifyToken(token, { secretKey });
    if (!payload.sub) {
      res.status(401).json({ error: 'Invalid session token' });
      return null;
    }
    return payload.sub;
  } catch (error) {
    console.warn('[Auth] Token verification failed:', error);
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }
}
