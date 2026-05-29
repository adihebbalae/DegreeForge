// Clerk auth stubs — activate by setting CLERK_SECRET_KEY in environment.
// Install @clerk/express when wiring: npm install @clerk/express --workspace=packages/server

import { Request, Response, NextFunction } from 'express';

/*
 * When CLERK_SECRET_KEY is set, replace the body of clerkAuthMiddleware with:
 *
 *   import { clerkMiddleware } from '@clerk/express';
 *   export const clerkAuthMiddleware = clerkMiddleware();
 *
 * And replace requireUtEmail with proper claim validation using getAuth(req).
 */

export function clerkAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!process.env.CLERK_SECRET_KEY) {
    next();
    return;
  }

  // Clerk middleware would run here once @clerk/express is installed and
  // CLERK_SECRET_KEY is set. For now, pass through unconditionally.
  next();
}

export function requireUtEmail(req: Request, res: Response, next: NextFunction): void {
  if (!process.env.CLERK_SECRET_KEY) {
    next();
    return;
  }

  const auth = (req as Request & { auth?: { sessionClaims?: { email?: string } } }).auth;
  const email = auth?.sessionClaims?.email ?? '';

  if (!email.endsWith('@utexas.edu') && !email.endsWith('@eid.utexas.edu')) {
    res.status(403).json({ error: 'UT Austin email required' });
    return;
  }

  next();
}
