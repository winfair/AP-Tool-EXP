// aim-math.js
// Geometry between phone and target.
// EXPECTS phone.headingDeg to be TRUE heading (not magnetic).

window.AimMath = (function () {
  const R_EARTH = 6371000; // meters

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function toDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  function normalizeHeading(deg) {
    let d = deg % 360;
    if (d < 0) d += 360;
    return d;
  }

  function angleDiff(targetDeg, currentDeg) {
    if (!isFinite(targetDeg) || !isFinite(currentDeg)) return NaN;
    let diff = ((targetDeg - currentDeg + 540) % 360) - 180;
    return diff; // -180..+180
  }

  // Haversine horizontal distance (m) and initial bearing (deg true)
  function horizAndBearing(lat1, lon1, lat2, lon2) {
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dPhi = toRad(lat2 - lat1);
    const dLambda = toRad(lon2 - lon1);

    const a =
      Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R_EARTH * c;

    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

    let bearing = toDeg(Math.atan2(y, x));
    bearing = normalizeHeading(bearing);

    return { distanceM: d, bearingDeg: bearing };
  }

  function solution(phone, target) {
    if (
      !phone ||
      !target ||
      !isFinite(phone.lat) ||
      !isFinite(phone.lon) ||
      !isFinite(target.lat) ||
      !isFinite(target.lon)
    ) {
      return { valid: false };
    }

    const { distanceM, bearingDeg } = horizAndBearing(
      phone.lat,
      phone.lon,
      target.lat,
      target.lon
    );

    const phoneAlt = isFinite(phone.alt) ? phone.alt : null;
    const targetAlt = isFinite(target.alt) ? target.alt : null;

    let verticalDelta = null;
    let pitchRequiredDeg = null;

    if (phoneAlt != null && targetAlt != null) {
      verticalDelta = targetAlt - phoneAlt;
      const horizontal = Math.max(distanceM, 0.001); // avoid /0
      pitchRequiredDeg = toDeg(Math.atan2(verticalDelta, horizontal));
    }

    const headingTrueRequired = bearingDeg;
    const phoneHeadingTrue = isFinite(phone.headingDeg) ? normalizeHeading(phone.headingDeg) : null;
    const phonePitch = isFinite(phone.pitchDeg) ? phone.pitchDeg : null;

    let headingErrorDeg = null;
    let pitchErrorDeg = null;

    if (phoneHeadingTrue != null) {
      headingErrorDeg = angleDiff(headingTrueRequired, phoneHeadingTrue);
    }

    if (phonePitch != null && pitchRequiredDeg != null) {
      // positive error = tilt up, negative = tilt down
      pitchErrorDeg = pitchRequiredDeg - phonePitch;
    }

    return {
      valid: true,
      bearingDeg: headingTrueRequired,
      requiredHeadingDeg: headingTrueRequired,
      requiredPitchDeg: pitchRequiredDeg,
      headingErrorDeg,
      pitchErrorDeg,
      horizontalDistanceM: distanceM,
      verticalDeltaM: verticalDelta
    };
  }

  return {
    solution
  };
})();
