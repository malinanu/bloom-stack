// Static farm scenery: ground, paths, hedges, trees, props, lights, and the follow camera.
import * as THREE from 'three';
import { BOUNDS, FIELDS, STATION, COUNTER } from './layout.js';
import { damp } from '../core/tween.js';

const GRASS = 0x8cc957;

/** One InstancedMesh per mesh in a single-mesh KayKit model, placed at many transforms. */
export function instanced(model, transforms) {
  let src = null;
  model.traverse((o) => { if (!src && o.isMesh) src = o; });
  const mesh = new THREE.InstancedMesh(src.geometry, src.material, transforms.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  transforms.forEach(({ x, y = 0, z, rot = 0, s = 1 }, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Sky light + a shadow-casting sun. Shared by the garden and the level arena. Returns the sun. */
export function addLights(scene, lowFx = false) {
  scene.background = new THREE.Color(GRASS);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88b04b, 1.5));
  const sun = new THREE.DirectionalLight(0xfff4dc, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowFx ? 1024 : 2048, lowFx ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 70;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  return sun;
}

/** Big grass plane with a little colour variation. */
export function makeGround() {
  const geo = new THREE.PlaneGeometry(160, 160, 64, 64).rotateX(-Math.PI / 2);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  const c = new THREE.Color();
  const r = rand(7);
  for (let i = 0; i < geo.attributes.position.count; i++) {
    c.setHex(GRASS).offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.04);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  return ground;
}

/** Keep a sun's shadow camera centred on what the player sees. */
export function followSun(sun, target) {
  sun.position.set(target.x - 9, 22, target.z + 12);
  sun.target.position.set(target.x, 0, target.z);
}

export class World {
  constructor(scene, assets, { lowFx = false } = {}) {
    this.scene = scene;
    this.sun = addLights(scene, lowFx);
    this.buildGround();
    this.buildPaths();
    this.buildHedges(assets);
    this.buildProps(assets);
  }

  buildGround() {
    this.scene.add(makeGround());

    // Slightly darker beds under the flower fields.
    const bedMat = new THREE.MeshLambertMaterial({ color: 0x79b84a });
    for (const f of FIELDS) {
      const [x0, z0, x1, z1] = f.rect;
      if (f.type !== 'tulip') continue;
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 0.8, z1 - z0 + 0.8).rotateX(-Math.PI / 2), bedMat);
      bed.position.set((x0 + x1) / 2, 0.005, (z0 + z1) / 2);
      bed.receiveShadow = true;
      this.scene.add(bed);
    }
  }

  buildPaths() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xead9ac });
    const edge = new THREE.MeshLambertMaterial({ color: 0xd4c08e });
    const slab = (x0, z0, x1, z1) => {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 0.3, z1 - z0 + 0.3).rotateX(-Math.PI / 2), edge);
      e.position.set((x0 + x1) / 2, 0.01, (z0 + z1) / 2);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), mat);
      m.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
      e.receiveShadow = m.receiveShadow = true;
      this.scene.add(e, m);
    };
    slab(-13.5, -1.6, 13.5, 6.2); // hub plaza
    slab(-1.2, 6.2, 1.2, 9.5); // south entrance
    slab(13.5, -3.6, 16.5, 0.6); // to rose greenhouse
    slab(-16.5, -3.6, -13.5, 0.6); // to peony greenhouse
    slab(-1, -16.6, 1, -15.4); // between tulip fields
  }

  buildHedges(assets) {
    const r = rand(11);
    const hedge = [];
    const { minX, maxX, minZ, maxZ } = BOUNDS;
    const step = 1.25;
    const add = (x, z) => hedge.push({ x: x + (r() - 0.5) * 0.3, z: z + (r() - 0.5) * 0.3, rot: r() * 6.28, s: 2.6 + r() * 0.8 });
    for (let x = minX; x <= maxX; x += step) { add(x, minZ - 0.8); if (Math.abs(x) > 1.8) add(x, maxZ + 0.8); }
    for (let z = minZ; z <= maxZ; z += step) { add(minX - 0.8, z); add(maxX + 0.8, z); }
    this.scene.add(instanced(assets.gltf.bush2.scene, hedge));

    // Hydrangea-style flowering bushes dotted along the hedge (as in the ad), and trees outside it.
    const blooms = hedge.filter(() => r() < 0.35).map((h) => ({ ...h, s: h.s * 1.05, y: 0.15 }));
    const bloomMesh = instanced(assets.gltf.bush4.scene, blooms);
    this.scene.add(bloomMesh);

    const trees = [];
    for (let i = 0; i < 46; i++) {
      const side = i % 4;
      const t = r();
      let x; let z;
      if (side === 0) { x = minX - 4 - r() * 8; z = minZ + t * (maxZ - minZ + 10); }
      else if (side === 1) { x = maxX + 4 + r() * 8; z = minZ + t * (maxZ - minZ + 10); }
      else if (side === 2) { x = minX + t * (maxX - minX); z = minZ - 4 - r() * 8; }
      else { x = minX + t * (maxX - minX); z = maxZ + 4 + r() * 6; if (Math.abs(x) < 4) continue; }
      trees.push({ x, z, rot: r() * 6.28, s: 1.1 + r() * 0.5 });
    }
    this.scene.add(instanced(assets.gltf.tree1.scene, trees.filter((_, i) => i % 2 === 0)));
    this.scene.add(instanced(assets.gltf.tree2.scene, trees.filter((_, i) => i % 2 === 1)));

    const rocks = [];
    for (let i = 0; i < 14; i++) {
      const onLeft = i % 2 === 0;
      rocks.push({ x: onLeft ? minX + 0.6 + r() * 1.5 : maxX - 0.6 - r() * 1.5, z: minZ + r() * (maxZ - minZ), rot: r() * 6.28, s: 0.9 + r() * 0.7 });
    }
    this.scene.add(instanced(assets.gltf.rock1.scene, rocks));
  }

  buildProps(assets) {
    const place = (key, x, z, { rot = 0, s = 1, y = 0 } = {}) => {
      const o = assets.prop(key, s);
      o.position.set(x, y, z);
      o.rotation.y = rot;
      this.scene.add(o);
      return o;
    };
    // Station dressing
    place('crate', STATION.table.x - 2.4, STATION.table.z + 1.2, { s: 0.45, rot: 0.3 });
    place('crate', STATION.table.x - 2.5, STATION.table.z + 1.1, { s: 0.38, rot: -0.2, y: 0.36 });
    place('bucket', STATION.table.x + 1.9, STATION.table.z + 1.3, { s: 0.7 });
    place('lantern', -13, -1.2, { s: 1 });
    place('lantern', 13, -1.2, { s: 1 });
    place('lantern', -1.8, 9.3, { s: 1 });
    place('lantern', 1.8, 9.3, { s: 1 });
    // A little café corner by the counter where customers come from.
    place('roundTable', 10.5, 7.6, { s: 0.5 });
    place('chair', 9.5, 7.6, { rot: Math.PI / 2 });
    place('chair', 11.5, 7.6, { rot: -Math.PI / 2 });
    place('shovel', -9.6, -3.4, { rot: 0.4, y: 0.7 }).rotation.z = 0.25;
    place('bucket', -10.3, -3.6, { s: 0.6 });
    place('crate', COUNTER.x + 2.3, COUNTER.z - 0.6, { s: 0.4 });
  }

  /** Keep the shadow camera centred on what the player sees. */
  update(target) {
    followSun(this.sun, target);
  }
}

/** Angled top-down follow camera (like the ad) that frames the same play area at any aspect ratio. */
export class CameraRig {
  constructor(camera, bounds = BOUNDS) {
    this.camera = camera;
    this.bounds = bounds;
    this.target = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.pitch = THREE.MathUtils.degToRad(48);
    this.distance = 22;
    this.shake = 0;
  }

  resize(aspect) {
    const cam = this.camera;
    cam.aspect = aspect;
    cam.fov = aspect < 1 ? 50 : 40;
    const vHalf = THREE.MathUtils.degToRad(cam.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const wantW = aspect < 1 ? 11.5 : 16;
    const wantH = 12;
    const dW = wantW / 2 / Math.tan(hHalf);
    const dH = wantH / 2 / Math.tan(vHalf);
    this.distance = THREE.MathUtils.clamp(Math.max(dW, dH), 15, 34);
    cam.updateProjectionMatrix();
  }

  snap(pos) {
    this.focus.copy(pos);
    this.apply(0);
  }

  update(dt, pos, lead = null) {
    this.target.copy(pos);
    if (lead) this.target.add(lead);
    this.focus.lerp(this.target, damp(5, dt));
    // Keep the view inside the play area (a small arena just centres on its axis).
    const b = this.bounds;
    const fit = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : THREE.MathUtils.clamp(v, lo, hi));
    this.focus.x = fit(this.focus.x, b.minX + 4, b.maxX - 4);
    this.focus.z = fit(this.focus.z, b.minZ + 3, b.maxZ - 2);
    this.apply(dt);
  }

  apply(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shake * this.shake * 0.25;
    const off = new THREE.Vector3(0, Math.sin(this.pitch), Math.cos(this.pitch)).multiplyScalar(this.distance);
    this.camera.position.copy(this.focus).add(off);
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.lookAt(this.focus.x, this.focus.y + 0.6, this.focus.z);
  }
}
