// Picks the older point the Backend uses to work out the direction of travel (07 UC-5).
import { HeadingSample } from "../api/client";

// accuracy is the radius in metres the device reports (null when unknown).
export type Fix = { latitude: number; longitude: number; timestamp: number; accuracy: number | null };

export const MIN_SAMPLE_DISTANCE_M = 15;
export const MAX_SAMPLE_AGE_MS = 60_000;
// GPS jitter of a stationary phone can exceed MIN_SAMPLE_DISTANCE_M with poor fixes (issue #5).
export const MAX_ACCURACY_M = 20;

function accurate(f: Fix): boolean {
  return f.accuracy === null || f.accuracy <= MAX_ACCURACY_M;
}

export function distanceMeters(a: Fix, b: Fix): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function pickHeadingSample(fixes: Fix[], current: Fix): HeadingSample | null {
  if (!accurate(current)) return null;
  const candidates = fixes.filter(
    (f) =>
      accurate(f) &&
      f.timestamp < current.timestamp &&
      current.timestamp - f.timestamp <= MAX_SAMPLE_AGE_MS &&
      distanceMeters(f, current) >= MIN_SAMPLE_DISTANCE_M,
  );
  if (candidates.length === 0) return null;
  const newest = candidates.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  return { latitude: newest.latitude, longitude: newest.longitude, at: new Date(newest.timestamp).toISOString() };
}
