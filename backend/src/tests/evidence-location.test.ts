/**
 * EVIDENCE LOCATION + REVERSE GEOCODING — verification.
 * ---------------------------------------------------------------------------
 * Proves the evidence-gps contract without a running server:
 *
 *   A. A captured location is validated: valid coordinates pass, out-of-range
 *      latitude/longitude and a negative accuracy are REJECTED.
 *   B. A denied / unavailable / timed-out / missing location is accepted and
 *      recorded honestly (it never blocks an upload).
 *   C. EXIF capture times are normalised; a missing time stays "unavailable".
 *   D. Reverse geocoding resolves a place name, and degrades gracefully on a
 *      no-match, a 429 rate limit, a provider error, and when disabled.
 *
 * Run: npx tsx src/tests/evidence-location.test.ts
 */
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directories at import time, so this must come first.
useTemporaryLocalStore('evidence-location');

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(requirement: string, condition: boolean, evidence = '') {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${requirement}`);
  } else {
    fail++;
    failures.push(requirement);
    console.log(`  [FAIL] ${requirement}${evidence ? `\n         evidence: ${evidence}` : ''}`);
  }
}

async function main() {
  const {
    parseEvidenceLocation,
    parseEvidenceCaptureTimes,
    normaliseCaptureTime,
    EvidenceValidationError,
    emptyEvidenceLocation,
  } = await import('../modules/counselling/evidence.service.js');
  const { reverseGeocode } = await import('../services/geocoding.service.js');

  console.log('\n=== Evidence location + reverse geocoding verification ===\n');

  // ---------------------------------------------------------------------------
  console.log('A. Server-side coordinate validation');
  // ---------------------------------------------------------------------------
  {
    const captured = parseEvidenceLocation({
      status: 'CAPTURED',
      latitude: 11.0168,
      longitude: 76.9558,
      accuracy: 12.5,
      capturedAt: '2026-09-10T10:15:00.000Z',
    });
    check('a valid captured location is accepted', captured.status === 'CAPTURED');
    check('latitude is preserved', captured.latitude === 11.0168);
    check('longitude is preserved', captured.longitude === 76.9558);
    check('accuracy is preserved', captured.accuracyMeters === 12.5);
    check('it defaults to "place not yet attempted"', captured.placeNameStatus === 'NOT_ATTEMPTED');

    const tooHigh = () => parseEvidenceLocation({ status: 'CAPTURED', latitude: 91, longitude: 10 });
    let highCode = '';
    try {
      tooHigh();
    } catch (err: any) {
      highCode = err instanceof EvidenceValidationError ? err.code : String(err);
    }
    check('latitude > 90 is rejected', highCode === 'INVALID_LATITUDE', highCode);

    const tooLow = () => parseEvidenceLocation({ status: 'CAPTURED', latitude: -90.5, longitude: 10 });
    let lowCode = '';
    try {
      tooLow();
    } catch (err: any) {
      lowCode = err instanceof EvidenceValidationError ? err.code : String(err);
    }
    check('latitude < -90 is rejected', lowCode === 'INVALID_LATITUDE', lowCode);

    const longHigh = () => parseEvidenceLocation({ status: 'CAPTURED', latitude: 10, longitude: 181 });
    let longHighCode = '';
    try {
      longHigh();
    } catch (err: any) {
      longHighCode = err instanceof EvidenceValidationError ? err.code : String(err);
    }
    check('longitude > 180 is rejected', longHighCode === 'INVALID_LONGITUDE', longHighCode);

    const longLow = () => parseEvidenceLocation({ status: 'CAPTURED', latitude: 10, longitude: -180.1 });
    let longLowCode = '';
    try {
      longLow();
    } catch (err: any) {
      longLowCode = err instanceof EvidenceValidationError ? err.code : String(err);
    }
    check('longitude < -180 is rejected', longLowCode === 'INVALID_LONGITUDE', longLowCode);

    const badAccuracy = () => parseEvidenceLocation({ status: 'CAPTURED', latitude: 10, longitude: 10, accuracy: -5 });
    let accCode = '';
    try {
      badAccuracy();
    } catch (err: any) {
      accCode = err instanceof EvidenceValidationError ? err.code : String(err);
    }
    check('a negative accuracy is rejected', accCode === 'INVALID_LOCATION_ACCURACY', accCode);

    const boundary = parseEvidenceLocation({ status: 'CAPTURED', latitude: 90, longitude: 180, accuracy: 0 });
    check('boundary values (90 / 180) are accepted', boundary.latitude === 90 && boundary.longitude === 180);
  }

  // ---------------------------------------------------------------------------
  console.log('\nB. Denied / unavailable / missing location never blocks an upload');
  // ---------------------------------------------------------------------------
  {
    for (const status of ['DENIED', 'UNAVAILABLE', 'TIMEOUT', 'ERROR']) {
      const parsed = parseEvidenceLocation({ status });
      check(`a "${status}" location is accepted with no coordinates`, parsed.status === status && parsed.latitude === null && parsed.longitude === null);
    }

    const missing = parseEvidenceLocation(undefined);
    check('a missing location is recorded as NOT_REQUESTED', missing.status === 'NOT_REQUESTED');

    const empty = emptyEvidenceLocation();
    check('the default location is NOT_REQUESTED', empty.status === 'NOT_REQUESTED' && empty.latitude === null);

    const unknown = parseEvidenceLocation({ status: 'SOMETHING_ELSE', latitude: 1, longitude: 1 });
    check('an unknown status falls back to a safe non-captured status', unknown.status === 'UNAVAILABLE');
  }

  // ---------------------------------------------------------------------------
  console.log('\nC. Capture-time normalisation');
  // ---------------------------------------------------------------------------
  {
    check(
      'EXIF "YYYY:MM:DD HH:MM:SS" is normalised',
      normaliseCaptureTime('2026:09:10 14:23:11') === '2026-09-10T14:23:11'
    );
    check(
      'a missing seconds component still normalises',
      normaliseCaptureTime('2026-09-10 14:23') === '2026-09-10T14:23:00'
    );
    check('garbage is reported as unavailable, never guessed', normaliseCaptureTime('not a date') === null);
    check('an absent value stays null', normaliseCaptureTime(null) === null);

    const times = parseEvidenceCaptureTimes([
      { time: '2026:09:10 14:23:11', source: 'EXIF' },
      null,
      '2026-09-11 09:00:00',
    ]);
    check('capture times are aligned with the files', times.length === 3);
    check('an EXIF entry is marked CAPTURED', times[0].captureTime === '2026-09-10T14:23:11' && times[0].captureTimeStatus === 'CAPTURED');
    check('a missing entry is marked UNAVAILABLE', times[1].captureTime === null && times[1].captureTimeStatus === 'UNAVAILABLE');
    check('a plain string entry is accepted', times[2].captureTime === '2026-09-11T09:00:00');
  }

  // ---------------------------------------------------------------------------
  console.log('\nD. Reverse geocoding degrades gracefully');
  // ---------------------------------------------------------------------------
  {
    const okFetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        address: {
          suburb: 'Gandhipuram',
          city: 'Coimbatore',
          state: 'Tamil Nadu',
          country: 'India',
        },
        display_name: 'Gandhipuram, Coimbatore, Tamil Nadu, India',
      }),
    })) as unknown as typeof fetch;

    const resolved = await reverseGeocode(11.0168, 76.9558, okFetch);
    check('a successful lookup is RESOLVED', resolved.status === 'RESOLVED');
    check(
      'the place name is human-readable',
      resolved.placeName === 'Gandhipuram, Coimbatore, Tamil Nadu, India',
      String(resolved.placeName)
    );

    let seenUrl = '';
    const urlCapture = (async (url: any) => {
      seenUrl = String(url);
      return { ok: true, status: 200, json: async () => ({ address: { city: 'X' } }) };
    }) as unknown as typeof fetch;
    await reverseGeocode(11.0168, 76.9558, urlCapture);
    check('the coordinates are sent to the provider', seenUrl.includes('lat=11.0168') && seenUrl.includes('lon=76.9558'), seenUrl);

    const noMatch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: 'Unable to geocode' }),
    })) as unknown as typeof fetch;
    const noMatchResult = await reverseGeocode(0, 0, noMatch);
    check('a no-match reply is NOT_FOUND with no invented place', noMatchResult.status === 'NOT_FOUND' && noMatchResult.placeName === null);

    const rateLimited = (async () => ({ ok: false, status: 429, json: async () => ({}) })) as unknown as typeof fetch;
    const rateResult = await reverseGeocode(11, 77, rateLimited);
    check('a 429 is reported as RATE_LIMITED', rateResult.status === 'RATE_LIMITED');

    const boom = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const boomResult = await reverseGeocode(11, 77, boom);
    check('a provider error is reported as ERROR, not thrown', boomResult.status === 'ERROR');

    process.env.GEOCODING_DISABLED = 'true';
    const disabledResult = await reverseGeocode(11, 77, okFetch);
    delete process.env.GEOCODING_DISABLED;
    check('geocoding can be disabled by config', disabledResult.status === 'DISABLED');
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('evidence-location test crashed:', err);
  process.exit(1);
});
