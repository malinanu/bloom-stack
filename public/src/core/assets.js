// Loads the KayKit models (CC0, see assets/licenses) and hands out clones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/** KayKit characters are ≈2.2 units tall; this scales every KayKit model to our ≈1.65 unit person. */
export const KAYKIT_SCALE = 0.75;

const MODELS = {
  rogue: 'characters/Rogue.glb',
  ranger: 'characters/Ranger.glb',
  barbarian: 'characters/Barbarian.glb',
  mage: 'characters/Mage.glb',
  knight: 'characters/Knight.glb',
  animBasic: 'characters/Rig_Medium_MovementBasic.glb',
  animGeneral: 'characters/Rig_Medium_General.glb',
  animTools: 'characters/Rig_Medium_Tools.glb',
  animSim: 'characters/Rig_Medium_Simulation.glb',
  counter: 'props/kitchencounter_straight_A.gltf',
  crate: 'props/crate.gltf',
  chair: 'props/chair_A.gltf',
  roundTable: 'props/table_round_A.gltf',
  scissors: 'props/scissors.gltf',
  shovel: 'props/shovel.gltf',
  bucket: 'props/bucket_metal.gltf',
  lantern: 'props/lantern.gltf',
  coin: 'props/coin_gold.gltf',
  bush2: 'nature/Bush_2_A_Color1.gltf',
  bush4: 'nature/Bush_4_A_Color1.gltf',
  tree1: 'nature/Tree_1_A_Color1.gltf',
  tree2: 'nature/Tree_2_A_Color1.gltf',
  rock1: 'nature/Rock_1_A_Color1.gltf',
};

export class Assets {
  constructor() {
    this.gltf = {};
    this.clips = [];
  }

  async load(onProgress) {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => onProgress?.(loaded / total);
    const loader = new GLTFLoader(manager);
    const entries = await Promise.all(
      Object.entries(MODELS).map(async ([key, path]) => [key, await loader.loadAsync(`./assets/${path}`)]),
    );
    this.gltf = Object.fromEntries(entries);
    this.clips = ['animBasic', 'animGeneral', 'animTools', 'animSim'].flatMap((k) => this.gltf[k].animations);
    for (const g of Object.values(this.gltf)) {
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = false;
        // KayKit textures are tiny palettes: nearest filtering keeps colours crisp and avoids bleeding.
        const map = o.material?.map;
        if (map) { map.magFilter = THREE.NearestFilter; map.generateMipmaps = false; map.minFilter = THREE.NearestFilter; }
      });
    }
  }

  /** Static prop clone, scaled to world size. */
  prop(key, scale = 1) {
    const obj = this.gltf[key].scene.clone(true);
    obj.scale.setScalar(KAYKIT_SCALE * scale);
    return obj;
  }

  clip(name) {
    const c = this.clips.find((a) => a.name === name);
    if (!c) throw new Error(`Missing animation ${name}`);
    return c;
  }

  /**
   * Skinned character clone with its own mixer.
   * @param {string} key rogue | ranger | barbarian | mage | knight
   * @param {{ hide?: RegExp, tint?: number }} opts
   */
  character(key, { hide = null } = {}) {
    const model = SkeletonUtils.clone(this.gltf[key].scene);
    model.scale.setScalar(KAYKIT_SCALE);
    model.traverse((o) => {
      if (o.isMesh && hide && hide.test(o.name)) o.visible = false;
    });
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    let current = null;
    const play = (name, { fade = 0.2, once = false, speed = 1 } = {}) => {
      let a = actions[name];
      if (!a) {
        a = mixer.clipAction(this.clip(name));
        actions[name] = a;
      }
      a.timeScale = speed;
      if (current === a && !once) return a;
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      a.play();
      if (current && current !== a) current.crossFadeTo(a, fade, false);
      current = a;
      return a;
    };
    return { model, mixer, play, actions };
  }
}
