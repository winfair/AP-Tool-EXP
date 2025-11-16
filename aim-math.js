// aim-math.js
// Geometry + pointing math for AP-Tool.
// Pure functions, no DOM. Uses simple spherical model for Earth.
//
// Exposes global `AimMath` with:
//
//   AimMath.bearingDeg(lat1, lon1, lat2, lon2)
//   AimMath.groundDistanceMeters(lat1, lon1, lat2, lon2)
//   AimMath.slopeDeg(lat1, lon1, alt1, lat2, lon2, alt2)
//   AimMath.solution(phone, target)
//
// Where:
//   phone  = { lat, lon, alt, headingDeg, pitchDeg }
//   target = { lat, lon, alt }
//
// All angles are degrees, distances in meters.

(function (global) {
  'use strict';

  var R_EARTH_M = 6371000; // mean Earth radius in meters

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function toDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  // Normalize heading to [0, 360)
  function normalizeDeg(angle) {
    var a = angle % 360;
    return a < 0 ? a + 360 : a;
  }

  // Shortest signed difference between two headings, in degrees.
  // Result is in (-180, 180].
  function headingDiff(targetDeg, currentDeg) {
    var diff = normalizeDeg(targetDeg) - normalizeDeg(currentDeg);
    diff = ((diff + 540) % 360) - 180;
    return diff;
  }

  // Great-circle initial bearing from (lat1, lon1) to (lat2, lon2).
  // All inputs in degrees; output in degrees from North, clockwise.
  function bearingDeg(lat1, lon1, lat2, lon2) {
    if (
      typeof lat1 !== 'number' ||
      typeof lon1 !== 'number' ||
      typeof lat2 !== 'number' ||
      typeof lon2 !== 'number'
    ) {
      return null;
    }

    var phi1 = toRad(lat1);
    var phi2 = toRad(lat2);
    var dLon = toRad(lon2 - lon1);

    var y = Math.sin(dLon) * Math.cos(phi2);
    var x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);

    var theta = Math.atan2(y, x);
    return normalizeDeg(toDeg(theta));
  }

  // Great-circle ground distance (ignores altitude), in meters.
  function groundDistanceMeters(lat1, lon1, lat2, lon2) {
    if (
      typeof lat1 !== 'number' ||
      typeof lon1 !== 'number' ||
      typeof lat2 !== 'number' ||
      typeof lon2 !== 'number'
    ) {
      return null;
    }

    var phi1 = toRad(lat1);
    var phi2 = toRad(lat2);
    var dPhi = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);

    var sinDPhi = Math.sin(dPhi / 2);
    var sinDLon = Math.sin(dLon / 2);

    var a =
      sinDPhi * sinDPhi +
      Math.cos(phi1) * Math.cos(phi2) * sinDLon * sinDLon;

    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R_EARTH_M * c;
  }

  // Slope angle between two 3D points, given lat/lon/alt for each.
  // Returns angle in degrees: positive = target above phone, negative = below.
  function slopeDeg(lat1, lon1, alt1, lat2, lon2, alt2) {
    var horizontal = groundDistanceMeters(lat1, lon1, lat2, lon2);
    if (horizontal === null) return null;

    if (typeof alt1 !== 'number' || typeof alt2 !== 'number') {
      return null; // cannot compute without both altitudes
    }

    var dAlt = alt2 - alt1; // positive if target is higher than phone
    var angleRad = Math.atan2(dAlt, horizontal);
    return toDeg(angleRad);
  }

  // Main helper: given phone + target state, compute everything needed
  // to aim the phone at the target.
  //
  // phone  = {
  //   lat:        number,
  //   lon:        number,
  //   alt:        number | null,
  //   headingDeg: number | null,  // current compass heading
  //   pitchDeg:   number | null   // current pitch
  // }
  //
  // target = {
  //   lat:  number,
  //   lon:  number,
  //   alt:  number | null
  // }
  //
  // Returns:
  // {
  //   valid: boolean,
  //   bearingDeg: number | null,
  //   horizontalDistanceM: number | null,
  //   verticalDeltaM: number | null,
  //   slopeDeg: number | null,
  //   lineOfSightDistanceM: number | null,
  //   requiredHeadingDeg: number | null,
  //   requiredPitchDeg: number | null,
  //   headingErrorDeg: number | null,   // + = turn right, - = turn left
  //   pitchErrorDeg: number | null      // + = tilt up,   - = tilt down
  // }
  function solution(phone, target) {
    phone = phone || {};
    target = target || {};

    var pLat = phone.lat;
    var pLon = phone.lon;
    var pAlt = phone.alt;
    var tLat = target.lat;
    var tLon = target.lon;
    var tAlt = target.alt;

    var bearing = bearingDeg(pLat, pLon, tLat, tLon);
    var horiz = groundDistanceMeters(pLat, pLon, tLat, tLon);

    var vert = null;
    var slope = null;
    var los = null;

    if (typeof pAlt === 'number' && typeof tAlt === 'number') {
      vert = tAlt - pAlt;
      slope = slopeDeg(pLat, pLon, pAlt, tLat, tLon, tAlt);
      if (horiz !== null) {
        los = Math.sqrt(horiz * horiz + vert * vert);
      }
    }

    var requiredHeading = bearing;
    var requiredPitch = slope;

    var headingErr = null;
    var pitchErr = null;

    if (typeof requiredHeading === 'number' && typeof phone.headingDeg === 'number') {
      headingErr = headingDiff(requiredHeading, phone.headingDeg);
    }

    if (typeof requiredPitch === 'number' && typeof phone.pitchDeg === 'number') {
      // Convention: positive error means "tilt up" toward target
      pitchErr = requiredPitch - phone.pitchDeg;
    }

    var valid =
      typeof pLat === 'number' &&
      typeof pLon === 'number' &&
      typeof tLat === 'number' &&
      typeof tLon === 'number';

    return {
      valid: !!valid,
      bearingDeg: bearing,
      horizontalDistanceM: horiz,
      verticalDeltaM: vert,
      slopeDeg: slope,
      lineOfSightDistanceM: los,
      requiredHeadingDeg: requiredHeading,
      requiredPitchDeg: requiredPitch,
      headingErrorDeg: headingErr,
      pitchErrorDeg: pitchErr
    };
  }

  global.AimMath = {
    toRad: toRad,
    toDeg: toDeg,
    bearingDeg: bearingDeg,
    groundDistanceMeters: groundDistanceMeters,
    slopeDeg: slopeDeg,
    solution: solution
  };
})(window);
