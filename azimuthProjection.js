// azimuthProjection.js
// Compute azimuth of the phone's TOP (device Y axis) in world space.

export function computeAzimuthFromDeviceAxes(deviceAxes) {
  if (!deviceAxes || !deviceAxes.y) return null;

  // phone top in world
  const v = deviceAxes.y; // {x: east, y: north, z: up}

  // project to horizontal
  const east = v.x;
  const north = v.y;

  const mag = Math.hypot(east, north);
  if (mag < 1e-6) return null;

  // 0° = north, clockwise
  const azRad = Math.atan2(east, north);
  let azDeg = azRad * (180 / Math.PI);
  if (azDeg < 0) azDeg += 360;

  return {
    azimuthDeg: azDeg,
    x: east / mag,
    y: north / mag
  };
}
