import { Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'refreshToken';

/** Keeps the long-lived credential out of JavaScript-accessible storage. */
export function setRefreshTokenCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production';
  const sameSite = secure ? 'SameSite=None' : 'SameSite=Lax';
  res.setHeader(
    'Set-Cookie',
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/api/auth; Max-Age=2592000; ${sameSite}${secure ? '; Secure' : ''}`,
  );
}

export function clearRefreshTokenCookie(res: Response): void {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `${REFRESH_COOKIE_NAME}=; HttpOnly; Path=/api/auth; Max-Age=0; ${secure ? 'SameSite=None; Secure' : 'SameSite=Lax'}`,
  );
}

export function getRefreshToken(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  const cookie = cookieHeader?.split(';').find((value) => value.trim().startsWith(`${REFRESH_COOKIE_NAME}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(REFRESH_COOKIE_NAME.length + 1)) : undefined;
}
