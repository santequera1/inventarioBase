import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { API_KEY_PREFIX } from "../config";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateApiKey(): { token: string; prefix: string; hash: string } {
  const prefix = randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "a").slice(0, 8);
  const secret = randomBytes(24).toString("base64url");
  const token = `${API_KEY_PREFIX}${prefix}.${secret}`;
  return { token, prefix, hash: sha256(token) };
}

export function parseApiKeyPrefix(token: string): string | null {
  if (!token.startsWith(API_KEY_PREFIX)) return null;
  const rest = token.slice(API_KEY_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot <= 0) return null;
  return rest.slice(0, dot);
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}
