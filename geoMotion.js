// geoMotion.js
// Module to request geolocation + motion and stream updates to your callbacks.

export class GeoMotionService {
  constructor() {
    this.geoWatchId = null;
    this.onGeo = null;     // function(posObj) {}
    this.onGeoError = null;

    this.onMotion = null;  // function(motionObj) {}
    this.motionActive = false;
  }

  // ----- GEOLOCATION -----
  startGeolocation(options = {}) {
    if (!('geolocation' in navigator)) {
      if (this.onGeoError) this.onGeoError(new Error('Geolocation not supported'));
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
        const ts = new Date(pos.timestamp);
        const data = {
          timestamp: ts,
          latitude,
          longitude,
          accuracy,
          altitude,
          speed,
          heading
        };
        if (this.onGeo) this.onGeo(data);
      },
      (err) => {
        if (this.onGeoError) this.onGeoError(err);
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

  // ----- MOTION / ORIENTATION -----
  async startMotion() {
    // iOS needs explicit permission
    const DeviceMotionEventRef = window.DeviceMotionEvent;
    const DeviceOrientationEventRef = window.DeviceOrientationEvent;

    const startListeners = () => {
      if (this.motionActive) return;
      this.motionActive = true;

      window.addEventListener('devicemotion', (event) => {
        const acc = event.acceleration || {};
        const accG = event.accelerationIncludingGravity || {};
        const rot = event.rotationRate || {};

        const data = {
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
        };

        if (this.onMotion) this.onMotion(data);
      });

      window.addEventListener('deviceorientation', (event) => {
        const data = {
          type: 'orientation',
          alpha: event.alpha,
          beta: event.beta,
          gamma: event.gamma
        };
        if (this.onMotion) this.onMotion(data);
      });
    };

    // if iOS-style permission API exists, request it
    if (DeviceMotionEventRef && typeof DeviceMotionEventRef.requestPermission === 'function') {
      try {
        const r1 = await DeviceMotionEventRef.requestPermission();
        const r2 = DeviceOrientationEventRef &&
          typeof DeviceOrientationEventRef.requestPermission === 'function'
          ? await DeviceOrientationEventRef.requestPermission()
          : 'granted';

        if (r1 === 'granted' && r2 === 'granted') {
          startListeners();
        } else {
          throw new Error('Motion/orientation permission denied');
        }
      } catch (err) {
        // surface this to main code via onMotion too, or do separate handler
        if (this.onMotion) {
          this.onMotion({ type: 'error', error: err.message || String(err) });
        }
      }
    } else {
      // Android / desktop
      startListeners();
    }
  }

  stopMotion() {
    // simplest: just mark inactive; removing listeners would require keeping references
    this.motionActive = false;
    // You can extend this to actually remove the listeners if needed.
  }
}
