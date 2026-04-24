import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function hashValue(value: string) {
  return bcrypt.hash(value, 10);
}

export async function compareValue(value: string, hash: string) {
  return bcrypt.compare(value, hash);
}

export function hashToken(token: string) {
  return bcrypt.hash(token, 10);
}

export function compareToken(token: string, hash: string) {
  return bcrypt.compare(token, hash);
}

export function decodeTokenExpiryMs(token: string): number {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  if (!decoded?.exp) return Date.now() + 30 * 24 * 60 * 60 * 1000;
  return decoded.exp * 1000;
}
