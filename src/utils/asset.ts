/**
 * Resolves a public asset path using Vite's BASE_URL.
 * In dev mode BASE_URL is "/", in production it's "/nexus-website/".
 * Usage: asset('/testimonials/person-1.webp')
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function asset(path: string): string {
  // path should start with '/'
  return `${base}${path}`;
}
