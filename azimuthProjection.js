// azimuthProjection.js
// Phone top edge = device Y
// World: x=east, y=north, z=up

export function computeAzimuthFromTopEdge(deviceAxes) {
  if (!deviceAxes || !deviceAxes.y) return null;

  const top = deviceAxes.y;

  const east = top.x;
  const north = top.y;
  const mag = Math.hypot(east, north);
  if (mag < 1e-6) return null;

  const azRad = Math.atan2(east, north);
  let azDeg = azRad * (180 / Math.PI);
  if (azDeg < 0) azDeg += 360;

  return {
    azimuthDeg: azDeg,
    x: east / mag,
    y: north / mag,
  };
}
