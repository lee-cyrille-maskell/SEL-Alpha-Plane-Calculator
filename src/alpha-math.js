// Alpha Plane math (JS mirror of Rust alpha_math.rs)
// Used for instant UI feedback without IPC round-trips

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

function angularDistance(a, b) {
  const diff = normalizeAngle(a - b);
  return diff > 180 ? 360 - diff : diff;
}

export function polarToCartesian(mag, angleDeg) {
  const rad = angleDeg * DEG2RAD;
  return { re: mag * Math.cos(rad), im: mag * Math.sin(rad) };
}

export function cartesianToPolar(re, im) {
  const mag = Math.sqrt(re * re + im * im);
  const angleDeg = Math.atan2(im, re) * RAD2DEG;
  return { mag, angleDeg };
}

export function isInRestraintRegion(r, thetaDeg, lr87, lang87) {
  if (lr87 <= 0) return false;
  const innerR = 1 / lr87;
  const outerR = lr87;
  if (r < innerR || r > outerR) return false;
  if (lang87 >= 360) return true;
  const halfAngle = lang87 / 2;
  const distFrom180 = angularDistance(thetaDeg, 180);
  return distFrom180 <= halfAngle;
}

// tolerancePct: percentage (e.g. 5 = 5%). Per Omicron "Check Test Tol." spec.
export function determineResult(r, thetaDeg, lr87, lang87, tolerancePct) {
  if (lr87 <= 0) return 'TRIP';
  const innerR = 1 / lr87;
  const outerR = lr87;
  const halfAngle = lang87 / 2;
  const tolFrac = tolerancePct / 100;

  const nearOuter = Math.abs(r - outerR) < outerR * tolFrac;
  const nearInner = Math.abs(r - innerR) < innerR * tolFrac;

  const angDistDeg = angularDistance(thetaDeg, 180);
  const angFromEdge = Math.abs(angDistDeg - halfAngle);
  const angDistLinear = r * (angFromEdge * DEG2RAD);
  const nearAngle = angDistLinear < r * tolFrac;

  const inRadialRange = r >= innerR && r <= outerR;
  const inAngularRange = angularDistance(thetaDeg, 180) <= halfAngle;

  const insideLimits = (nearOuter && inAngularRange)
    || (nearInner && inAngularRange)
    || (nearAngle && inRadialRange);

  if (insideLimits) return 'INSIDE_LIMITS';
  if (isInRestraintRegion(r, thetaDeg, lr87, lang87)) return 'RESTRAIN';
  return 'TRIP';
}

export function calculateCurrents(alphaMag, alphaAngle, refMag, refAngle, faultType) {
  const remoteMag = alphaMag * refMag;
  const remoteAngle = alphaAngle + refAngle;
  switch (faultType) {
    case 'A':
      return {
        localIA: { mag: refMag, ang: refAngle },
        localIB: { mag: 0, ang: 0 },
        localIC: { mag: 0, ang: 0 },
        remoteIA: { mag: remoteMag, ang: remoteAngle },
        remoteIB: { mag: 0, ang: 0 },
        remoteIC: { mag: 0, ang: 0 },
      };
    case 'B':
      return {
        localIA: { mag: 0, ang: 0 },
        localIB: { mag: refMag, ang: refAngle - 120 },
        localIC: { mag: 0, ang: 0 },
        remoteIA: { mag: 0, ang: 0 },
        remoteIB: { mag: remoteMag, ang: remoteAngle - 120 },
        remoteIC: { mag: 0, ang: 0 },
      };
    case 'C':
      return {
        localIA: { mag: 0, ang: 0 },
        localIB: { mag: 0, ang: 0 },
        localIC: { mag: refMag, ang: refAngle + 120 },
        remoteIA: { mag: 0, ang: 0 },
        remoteIB: { mag: 0, ang: 0 },
        remoteIC: { mag: remoteMag, ang: remoteAngle + 120 },
      };
    case '3P':
      return {
        localIA: { mag: refMag, ang: refAngle },
        localIB: { mag: refMag, ang: refAngle - 120 },
        localIC: { mag: refMag, ang: refAngle + 120 },
        remoteIA: { mag: remoteMag, ang: remoteAngle },
        remoteIB: { mag: remoteMag, ang: remoteAngle - 120 },
        remoteIC: { mag: remoteMag, ang: remoteAngle + 120 },
      };
    default:
      return {
        localIA: { mag: refMag, ang: refAngle },
        localIB: { mag: 0, ang: 0 },
        localIC: { mag: 0, ang: 0 },
        remoteIA: { mag: remoteMag, ang: remoteAngle },
        remoteIB: { mag: 0, ang: 0 },
        remoteIC: { mag: 0, ang: 0 },
      };
  }
}

// Phasor sum magnitude of two polar values
function phasorSumMag(m1, a1, m2, a2) {
  const { re: x1, im: y1 } = polarToCartesian(m1, a1);
  const { re: x2, im: y2 } = polarToCartesian(m2, a2);
  return Math.sqrt((x1 + x2) ** 2 + (y1 + y2) ** 2);
}

// Calculate differential current for the faulted phase(s)
// currents: object from calculateCurrents
// Returns { mag, phase }
export function calculateDiffCurrent(currents, faultType) {
  switch (faultType) {
    case 'A':
      return { mag: phasorSumMag(currents.localIA.mag, currents.localIA.ang, currents.remoteIA.mag, currents.remoteIA.ang), phase: 'A' };
    case 'B':
      return { mag: phasorSumMag(currents.localIB.mag, currents.localIB.ang, currents.remoteIB.mag, currents.remoteIB.ang), phase: 'B' };
    case 'C':
      return { mag: phasorSumMag(currents.localIC.mag, currents.localIC.ang, currents.remoteIC.mag, currents.remoteIC.ang), phase: 'C' };
    case '3P':
    default: {
      const a = phasorSumMag(currents.localIA.mag, currents.localIA.ang, currents.remoteIA.mag, currents.remoteIA.ang);
      const b = phasorSumMag(currents.localIB.mag, currents.localIB.ang, currents.remoteIB.mag, currents.remoteIB.ang);
      const c = phasorSumMag(currents.localIC.mag, currents.localIC.ang, currents.remoteIC.mag, currents.remoteIC.ang);
      const max = Math.max(a, b, c);
      const phase = max === a ? 'A' : max === b ? 'B' : 'C';
      return { mag: max, phase };
    }
  }
}

export function determineDiffResult(diffMag, lpp87, diffTolPct, diffTolAbsMa) {
  const effectiveTol = Math.max(lpp87 * diffTolPct / 100, diffTolAbsMa / 1000);
  if (Math.abs(diffMag - lpp87) < effectiveTol) return 'INSIDE_LIMITS';
  if (diffMag >= lpp87) return 'ABOVE_PICKUP';
  return 'BELOW_PICKUP';
}

export function determineOverallResult(alphaResult, diffResult) {
  if (alphaResult === 'INSIDE_LIMITS' || diffResult === 'INSIDE_LIMITS') return 'INSIDE_LIMITS';
  if (alphaResult === 'TRIP' && diffResult === 'ABOVE_PICKUP') return 'TRIP';
  return 'NO_TRIP';
}
