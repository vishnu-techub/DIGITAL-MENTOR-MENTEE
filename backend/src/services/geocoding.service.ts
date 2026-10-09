/**
 * KSRCE REVERSE GEOCODING (place name from GPS coordinates)
 * ---------------------------------------------------------------------------
 * Turns a captured latitude/longitude into a human-readable place name, when a
 * provider is configured and reachable.
 *
 * PROVIDER BOUNDARY
 *   The provider is not hardcoded. It is selected through environment
 *   variables, so an operator can point the project at any compatible
 *   reverse-geocoding service without a code change:
 *
 *     GEOCODING_DISABLED     "true" to switch geocoding off entirely.
 *     GEOCODING_BASE_URL     Base URL. Defaults to the public OpenStreetMap
 *                            Nominatim endpoint (free, no API key). Supply your
 *                            own to use a different provider.
 *     GEOCODING_USER_AGENT   REQUIRED by the OpenStreetMap usage policy when the
 *                            public endpoint is used; defaults to a project
 *                            identifier. Set a contact address for production.
 *     GEOCODING_TIMEOUT_MS   Per-lookup timeout. Defaults to 4000 ms.
 *
 *   No API key is embedded and none is required for the default endpoint. If
 *   your provider needs a key, keep it in the environment and append it to
 *   `GEOCODING_BASE_URL` (for example `...?key=...` is NOT possible with the
 *   Nominatim path below, so prefer a provider that accepts a header or a
 *   server-side proxy). This module deliberately does not read or log secrets.
 *
 * FAILURE POLICY
 *   A lookup failure NEVER blocks an upload. The caller keeps the captured
 *   coordinates and records an honest status:
 *     RESOLVED | NOT_FOUND | RATE_LIMITED | ERROR | UNAVAILABLE | DISABLED
 *
 * TEMPORARY LOCAL FILE STORAGE. See PROJECT_PROGRESS.md.
 */

export type PlaceNameStatus =
  | 'RESOLVED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'ERROR'
  | 'UNAVAILABLE'
  | 'DISABLED';

export interface PlaceNameResult {
  status: PlaceNameStatus;
  /** Human-readable locality, only set when `status === 'RESOLVED'`. */
  placeName: string | null;
  /** Structured address parts returned by the provider, for the UI. */
  details?: {
    locality?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
  } | null;
}

const DEFAULT_BASE_URL = 'https://nominatim.openstreetmap.org/reverse';
const DEFAULT_USER_AGENT = 'KSRCE-Mentor-Mentee/1.0 (educational project)';
const DEFAULT_TIMEOUT_MS = 4000;

function isDisabled(): boolean {
  const raw = String(process.env.GEOCODING_DISABLED || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function timeoutMs(): number {
  const raw = Number(process.env.GEOCODING_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function baseUrl(): string {
  const raw = String(process.env.GEOCODING_BASE_URL || '').trim();
  return raw || DEFAULT_BASE_URL;
}

function userAgent(): string {
  const raw = String(process.env.GEOCODING_USER_AGENT || '').trim();
  return raw || DEFAULT_USER_AGENT;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) return text;
  }
  return undefined;
}

/** Build a readable "locality, district, state" style label from provider data. */
function buildPlaceName(address: any, displayName?: unknown): { placeName: string; details: PlaceNameResult['details'] } | null {
  const a = address && typeof address === 'object' ? address : {};
  const details = {
    locality: firstString(a.suburb, a.neighbourhood, a.village, a.hamlet, a.quarter),
    city: firstString(a.city, a.town, a.municipality, a.city_district),
    district: firstString(a.county, a.district, a.state_district),
    state: firstString(a.state, a.region, a.province),
    country: firstString(a.country),
  };

  const ordered = [details.locality, details.city, details.district, details.state, details.country].filter(
    (v): v is string => Boolean(v)
  );
  // De-duplicate adjacent repeats (town === city is common in OSM data).
  const unique: string[] = [];
  for (const part of ordered) {
    if (unique[unique.length - 1] !== part) unique.push(part);
  }

  if (unique.length === 0) {
    const fallback = firstString(displayName);
    if (fallback) return { placeName: fallback, details };
    return null;
  }
  return { placeName: unique.join(', '), details };
}

/**
 * Reverse-geocode one coordinate pair.
 *
 * `fetch` is the global Node 22 implementation. The lookup is bounded by an
 * explicit timeout so a slow provider cannot stall an upload indefinitely.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  fetchImpl: typeof fetch = fetch
): Promise<PlaceNameResult> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { status: 'UNAVAILABLE', placeName: null };
  }
  if (isDisabled()) {
    return { status: 'DISABLED', placeName: null };
  }

  const url = new URL(baseUrl());
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '14');
  url.searchParams.set('addressdetails', '1');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': userAgent(),
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (response.status === 429) {
      return { status: 'RATE_LIMITED', placeName: null };
    }
    if (!response.ok) {
      return { status: 'ERROR', placeName: null };
    }

    const body: any = await response.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return { status: 'ERROR', placeName: null };
    }

    // A Nominatim "not found" reply is a 200 with an `error` field.
    if (body.error) {
      return { status: 'NOT_FOUND', placeName: null };
    }

    const built = buildPlaceName(body.address, body.display_name);
    if (!built) {
      return { status: 'NOT_FOUND', placeName: null };
    }
    return { status: 'RESOLVED', placeName: built.placeName, details: built.details };
  } catch {
    return { status: 'ERROR', placeName: null };
  } finally {
    clearTimeout(timer);
  }
}
