// compass3d.js
// needs THREE loaded globally
export class Compass3D {
  constructor(containerId) {
    const el = document.getElementById(containerId);
    this.container = el;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    const width = el.clientWidth || 400;
    const height = el.clientHeight || 300;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    el.appendChild(this.renderer.domElement);

    const light = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(light);

    const group = new THREE.Group();
    this.scene.add(group);
    this.group = group;

    this._addSphereLines();
    this._addCardinals();
    this._addPointer();

    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _addSphereLines() {
    const material = new THREE.LineBasicMaterial({ color: 0x4444ff, linewidth: 1 });

    // latitudes
    const radius = 1;
    for (let i = -60; i <= 60; i += 30) {
      const lat = i * Math.PI / 180;
      const circleGeom = new THREE.BufferGeometry();
      const points = [];
      const r = radius * Math.cos(lat);
      const y = radius * Math.sin(lat);
      for (let a = 0; a <= 360; a += 6) {
        const rad = a * Math.PI / 180;
        points.push(new THREE.Vector3(r * Math.cos(rad), y, r * Math.sin(rad)));
      }
      circleGeom.setFromPoints(points);
      const line = new THREE.Line(circleGeom, material);
      this.group.add(line);
    }

    // longitudes
    for (let i = 0; i < 360; i += 30) {
      const lon = i * Math.PI / 180;
      const lineGeom = new THREE.BufferGeometry();
      const points = [];
      for (let t = -90; t <= 90; t += 4) {
        const lat = t * Math.PI / 180;
        const x = radius * Math.cos(lat) * Math.cos(lon);
        const y = radius * Math.sin(lat);
        const z = radius * Math.cos(lat) * Math.sin(lon);
        points.push(new THREE.Vector3(x, y, z));
      }
      lineGeom.setFromPoints(points);
      const line = new THREE.Line(lineGeom, material);
      this.group.add(line);
    }
  }

  _addCardinals() {
    const makeLabel = (text, pos) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.font = '32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, 32);

      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.6, 0.3, 1);
      sprite.position.copy(pos);
      this.group.add(sprite);
    };

    makeLabel('N', new THREE.Vector3(0, 1.25, 0));
    makeLabel('S', new THREE.Vector3(0, -1.25, 0));
    makeLabel('E', new THREE.Vector3(1.25, 0, 0));
    makeLabel('W', new THREE.Vector3(-1.25, 0, 0));
  }

  _addPointer() {
    // pointer along +Y by default
    const pointerGroup = new THREE.Group();

    const shaftGeom = new THREE.CylinderGeometry(0.02, 0.02, 1.0, 12);
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const shaft = new THREE.Mesh(shaftGeom, shaftMat);
    shaft.position.y = 0.5;
    pointerGroup.add(shaft);

    const tipGeom = new THREE.ConeGeometry(0.06, 0.2, 16);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    const tip = new THREE.Mesh(tipGeom, tipMat);
    tip.position.y = 1.1;
    pointerGroup.add(tip);

    this.pointer = pointerGroup;
    this.group.add(this.pointer);
  }

  updateFromAxes(deviceAxes) {
    if (!deviceAxes || !deviceAxes.y) return;

    // device y is the top edge — that's the direction we want to point the arrow
    const dir = new THREE.Vector3(deviceAxes.y.x, deviceAxes.y.y, deviceAxes.y.z);
    dir.normalize();

    // make pointer point along dir
    // default pointer points +Y in its local, so we need quaternion from (0,1,0) to dir
    const from = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(from, dir);
    this.pointer.setRotationFromQuaternion(q);
  }

  _animate() {
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._animate);
  }

  onResize() {
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 300;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
