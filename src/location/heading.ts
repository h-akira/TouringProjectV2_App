// Picks the older point the Backend uses to work out the direction of travel (07 UC-5).
import { HeadingSample } from "../api/client";

export type Fix = { latitude: number; longitude: number; timestamp: number };

export const MIN_SAMPLE_DISTANCE_M = 15;
export const MAX_SAMPLE_AGE_MS = 60_000;

export function distanceMeters(a: Fix, b: Fix): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function pickHeadingSample(fixes: Fix[], current: Fix): HeadingSample | null {
  const candidates = fixes.filter(
    (f) =>
      f.timestamp < current.timestamp &&
      current.timestamp - f.timestamp <= MAX_SAMPLE_AGE_MS &&
      distanceMeters(f, current) >= MIN_SAMPLE_DISTANCE_M,
  );
  if (candidates.length === 0) return null;
  const newest = candidates.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  return { latitude: newest.latitude, longitude: newest.longitude, at: new Date(newest.timestamp).toISOString() };
}
