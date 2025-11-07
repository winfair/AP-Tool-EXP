// azimuthProjection.js
// World frame: x = east, y = north, z = up
// Device frame (browser): x = right, y = top edge, z = out of screen toward user

// 1) Use the phone's TOP EDGE (the small side with the earpiece).
// This is device Y in browser coords.
export function computeAzimuthFromTopEdge(deviceAxes) {
  if (!deviceAxes || !deviceAxes.y) return null;

  // device Y is the top edge
  const top = deviceAxes.y; // {x: east, y: north, z: up}

  // project to horizontal plane
  const east = top.x;
  const north = top.y;

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

// 2) OPTIONAL: use the phone's screen direction (away from user)
// This is useful if later you want "point the phone like a wand".
export function computeAzimuthFromScreenForward(deviceAxes) {
  if (!deviceAxes || !deviceAxes.z) return null;

  // device Z is out of screen toward user, so forward = -Z
  const forward = {
    x: -deviceAxes.z.x,
    y: -deviceAxes.z.y,
    z: -deviceAxes.z.z
  };

  const east = forward.x;
  const north = forward.y;

  const mag = Math.hypot(east, north);
  if (mag < 1e-6) return null;

  const azRad = Math.atan2(east, north);
  let azDeg = azRad * (180 / Math.PI);
  if (azDeg < 0) azDeg += 360;

  return {
    azimuthDeg: azDeg,
    x: east / mag,
    y: north / mag
  };
}
