// geoMotion.js
// Fetches geolocation and device motion/orientation, exposes callbacks.

export class GeoMotionService {
  constructor() {
    this.geoWatchId = null;
    this.onGeo = null;
    this.onGeoError = null;

    this.onMotion = null;
    this.motionActive = false;
  }

  startGeolocation(options = {}) {
    if (!('geolocation' in navigator)) {
      this.onGeoError && this.onGeoError(new Error('Geolocation not supported'));
      return;
    }

    const geoOpts = Object.assign(
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      },
      options
    );

    this.geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, altitude, speed, heading } = pos.coords;
        const data = {
          timestamp: new Date(pos.timestamp),
          latitude,
          longitude,
          accuracy,
          altitude,
          speed,
          heading
        };
        this.onGeo && this.onGeo(data);
      },
      (err) => {
        this.onGeoError && this.onGeoError(err);
      },
      geoOpts
    );
  }

  stopGeolocation() {
    if (this.geoWatchId !== null) {
      navigator.geolocation.clearWatch(this.geoWatchId);
      this.geoWatchId = null;
    }
  }

  async startMotion() {
    const DeviceMotionEventRef = window.DeviceMotionEvent;
    const DeviceOrientationEventRef = window.DeviceOrientationEvent;

    const startListeners = () => {
      if (this.motionActive) return;
      this.motionActive = true;

      window.addEventListener('devicemotion', (event) => {
        const acc = event.acceleration || {};
        const accG = event.accelerationIncludingGravity || {};
        const rot = event.rotationRate || {};

        this.onMotion &&
          this.onMotion({
            type: 'motion',
            acceleration: {
              x: acc.x ?? 0,
              y: acc.y ?? 0,
              z: acc.z ?? 0
            },
            accelerationIncludingGravity: {
              x: accG.x ?? 0,
              y: accG.y ?? 0,
              z: accG.z ?? 0
            },
            rotationRate: {
              alpha: rot.alpha ?? 0,
              beta: rot.beta ?? 0,
              gamma: rot.gamma ?? 0
            }
          });
      });

      window.addEventListener('deviceorientation', (event) => {
        this.onMotion &&
          this.onMotion({
            type: 'orientation',
            alpha: event.alpha,
            beta: event.beta,
            gamma: event.gamma
          });
      });
    };

    // iOS permission
    if (DeviceMotionEventRef && typeof DeviceMotionEventRef.requestPermission === 'function') {
      try {
        const r1 = await DeviceMotionEventRef.requestPermission();
        const r2 =
          DeviceOrientationEventRef &&
          typeof DeviceOrientationEventRef.requestPermission === 'function'
            ? await DeviceOrientationEventRef.requestPermission()
            : 'granted';

        if (r1 === 'granted' && r2 === 'granted') {
          startListeners();
        } else {
          this.onMotion &&
            this.onMotion({ type: 'error', error: 'Motion/orientation permission denied' });
        }
      } catch (err) {
        this.onMotion && this.onMotion({ type: 'error', error: String(err) });
      }
    } else {
      // Android / desktop
      startListeners();
    }
  }
}
