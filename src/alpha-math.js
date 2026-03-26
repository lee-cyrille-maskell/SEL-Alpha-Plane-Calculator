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

export function determineResult(r, thetaDeg, lr87, lang87, tolerance) {
  if (lr87 <= 0) return 'TRIP';
  const innerR = 1 / lr87;
  const outerR = lr87;
  const halfAngle = lang87 / 2;
  const distOuter = Math.abs(r - outerR);
  const distInner = Math.abs(r - innerR);
  const angDistDeg = angularDistance(thetaDeg, 180);
  const angFromEdge = Math.abs(angDistDeg - halfAngle);
  const angDistLinear = r * (angFromEdge * DEG2RAD);
  const minDist = Math.min(distOuter, distInner, angDistLinear);
  if (minDist < tolerance) return 'INSIDE_LIMITS';
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
