import json

# Minimal, deterministic LOS calculation used by app.js via Pyodide

def los_analyze_py(elevations, d_total, h_tx, h_rx, k=1.33):
    """
    elevations: list[float] — terrain elevations along path, including endpoints (m)
    d_total: float — total path distance (m)
    h_tx, h_rx: float — Tx/Rx heights (altitude + antenna, m)
    k: float — refractivity factor (effective Earth radius multiplier)

    Returns JSON str: {"blocked": bool, "minClear": float}
    """
    R = 6371000.0 * float(k)
    n = max(1, int(len(elevations)))
    blocked = False
    min_clear = float("inf")

    for i in range(n):
        f = 0.0 if n == 1 else i / (n - 1)
        d = d_total * f
        drop = (d * d) / (2.0 * R)
        ray = h_tx + f * (h_rx - h_tx) - drop
        t = elevations[i]
        clear = ray - t
        if clear < min_clear:
            min_clear = clear
        if t >= ray:
            blocked = True

    return json.dumps({"blocked": bool(blocked), "minClear": float(min_clear)})
