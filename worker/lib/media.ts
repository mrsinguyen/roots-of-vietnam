import type { MediaType } from '@roots/shared';
import type { Env } from '../types';

// Whitelist of accepted MIME types. The client-declared mimetype is used ONLY
// to pick the stored extension + Media.type label — never trusted for routing
// or execution. XSS defense is the serving headers (nosniff + attachment) set
// on /uploads.
export const ACCEPTED_MIME: Record<string, { type: MediaType; ext: string }> = {
  'image/jpeg': { type: 'image', ext: '.jpg' },
  'image/png': { type: 'image', ext: '.png' },
  'image/webp': { type: 'image', ext: '.webp' },
  'image/gif': { type: 'image', ext: '.gif' },
  'application/pdf': { type: 'pdf', ext: '.pdf' },
  'audio/mpeg': { type: 'audio', ext: '.mp3' },
  'audio/wav': { type: 'audio', ext: '.wav' },
  'audio/ogg': { type: 'audio', ext: '.ogg' },
  'audio/mp4': { type: 'audio', ext: '.m4a' },
  'application/msword': { type: 'doc', ext: '.doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    type: 'doc',
    ext: '.docx',
  },
};

export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

// R2 object keys are namespaced so backups (backups/) and media (media/) can be
// listed independently. The public path stays /uploads/<filename>.
function objectKey(filename: string): string {
  return `media/${filename}`;
}

export function basename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildFilename(mimetype: string): string | null {
  const meta = ACCEPTED_MIME[mimetype];
  if (!meta) return null;
  return `${Date.now()}-${randomHex(8)}${meta.ext}`;
}

export async function putMedia(
  env: Env,
  filename: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await env.MEDIA.put(objectKey(filename), body, {
    httpMetadata: { contentType },
  });
}

export async function deleteMedia(env: Env, filename: string): Promise<void> {
  await env.MEDIA.delete(objectKey(filename));
}

export async function getMedia(env: Env, filename: string): Promise<R2ObjectBody | null> {
  return env.MEDIA.get(objectKey(filename));
}
