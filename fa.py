import json
from math import sin, cos, atan2, sqrt, radians, degrees

R_EARTH = 6371000.0


def haversine(lat1, lon1, lat2, lon2):
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi, dl = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dl / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R_EARTH * c


def initial_bearing(lat1, lon1, lat2, lon2):
    phi1, phi2 = radians(lat1), radians(lat2)
    dl = radians(lon2 - lon1)
    y = sin(dl) * cos(phi2)
    x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(dl)
    brg = (degrees(atan2(y, x)) + 360.0) % 360.0
    return brg


def tilt_angle_meters(d, h_tx, h_rx, k=1.33):
    R_eff = R_EARTH * float(k)
    drop = (d * d) / (2.0 * R_eff)
    return degrees(atan2((h_rx - h_tx) - drop, d))


def fmt_distance(m, units):
    if units == "imperial":
        ft = m * 3.28084
        if m >= 1609.344:
            return f"{(m/1609.344):.2f} mi"
        return f"{round(ft)} ft"
    if m >= 1000:
        return f"{(m/1000):.2f} km"
    return f"{round(m)} m"


def fmt_altitude(m, units):
    if units == "imperial":
        return f"{round(m * 3.28084)} ft"
    return f"{round(m)} m"


def los_analyze_py(elevations, d_total, h_tx, h_rx, k=1.33):
    R_eff = R_EARTH * float(k)
    n = max(1, int(len(elevations)))
    blocked = False
    min_clear = float("inf")
    for i in range(n):
        f = 0.0 if n == 1 else i / (n - 1)
        d = d_total * f
        drop = (d * d) / (2.0 * R_eff)
        ray = h_tx + f * (h_rx - h_tx) - drop
        t = elevations[i]
        clear = ray - t
        if clear < min_clear:
            min_clear = clear
        if t >= ray:
            blocked = True
    return json.dumps({"blocked": bool(blocked), "minClear": float(min_clear)})


def update_solution_py(lat_tx, lon_tx, h_tx, heading, pitch,
                       lat_rx, lon_rx, h_rx, k_factor, units):
    if None in (lat_tx, lon_tx, h_tx, lat_rx, lon_rx, h_rx):
        return json.dumps({"ready": False})
    d = haversine(lat_tx, lon_tx, lat_rx, lon_rx)
    brg = initial_bearing(lat_tx, lon_tx, lat_rx, lon_rx)
    tilt = tilt_angle_meters(d, h_tx, h_rx, k_factor)
    az_err = None if heading is None else (((brg - heading + 540.0) % 360.0) - 180.0)
    tilt_err = None if pitch is None else (tilt - pitch)
    return json.dumps({
        "ready": True,
        "distance": d,
        "bearing": brg,
        "tilt": tilt,
        "azErr": az_err,
        "tiltErr": tilt_err,
        "distStr": fmt_distance(d, units),
        "tiltStr": f"{tilt:.1f}",
        "bearingStr": f"{brg:.1f}",
        "azErrStr": "–" if az_err is None else f"{az_err:.1f}",
        "tiltErrStr": "–" if tilt_err is None else f"{tilt_err:.1f}",
    })
