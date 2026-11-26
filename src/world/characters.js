import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PointLight,
  SphereGeometry,
  CapsuleGeometry,
} from 'three';
import { mats } from './materials.js';

function at(mesh, x, y, z) {
  mesh.position.set(x, y, z);
  return mesh;
}

/** 以肩膀為支點的手臂（往下垂），旋轉 x 就能前後擺動 */
function makeArm(x, material) {
  const pivot = new Group();
  pivot.position.set(x, 1.27, 0);
  const geom = new CylinderGeometry(0.06, 0.07, 0.42, 6);
  geom.translate(0, -0.21, 0);
  pivot.add(new Mesh(geom, material));
  pivot.add(at(new Mesh(new SphereGeometry(0.065, 6, 5), mats.skin), 0, -0.44, 0));
  return pivot;
}

/**
 * 提著燈籠的孩子（玩家）。模型正面朝 +z。
 * 回傳可以動的部位：body（上下晃、前傾）、head、手臂、腳、緞帶、燈籠。
 */
export function makePlayerModel() {
  const root = new Group();
  const body = new Group();
  root.add(body);

  body.add(at(new Mesh(new ConeGeometry(0.46, 0.95, 10), mats.robe), 0, 0.48, 0));
  body.add(at(new Mesh(new CylinderGeometry(0.2, 0.28, 0.42, 10), mats.jeogori), 0, 1.1, 0));
  // 衣帶（고름）
  body.add(at(new Mesh(new CylinderGeometry(0.03, 0.03, 0.3, 4), new MeshLambertMaterial({ color: 0x3a5fc8 })), 0.08, 1.02, 0.25));

  const head = new Group();
  head.position.set(0, 1.55, 0);
  head.add(new Mesh(new SphereGeometry(0.27, 12, 10), mats.skin));
  head.add(at(new Mesh(new SphereGeometry(0.29, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.hair), 0, 0.03, -0.02));
  head.add(at(new Mesh(new SphereGeometry(0.1, 6, 6), mats.hair), 0, -0.05, -0.3));
  for (const sx of [-1, 1]) head.add(at(new Mesh(new SphereGeometry(0.035, 5, 4), mats.black), sx * 0.09, 0.02, 0.25));
  // 辮子尾端的紅緞帶（댕기），以後腦為支點擺動
  const ribbon = new Group();
  ribbon.position.set(0, -0.08, -0.33);
  const ribbonGeom = new BoxGeometry(0.09, 0.42, 0.025);
  ribbonGeom.translate(0, -0.21, 0);
  ribbon.add(new Mesh(ribbonGeom, new MeshLambertMaterial({ color: 0xd03040 })));
  head.add(ribbon);
  body.add(head);

  const leftArm = makeArm(-0.27, mats.jeogori);
  const rightArm = makeArm(0.27, mats.jeogori);
  body.add(leftArm, rightArm);

  // 腳（從裙襬下露出來）
  const feet = [-1, 1].map((sx) => {
    const foot = at(new Mesh(new SphereGeometry(0.09, 6, 5), mats.darkWood), sx * 0.13, 0.06, 0.05);
    foot.scale.set(1, 0.7, 1.5);
    root.add(foot);
    return foot;
  });

  // 燈籠（청사초롱：上藍下紅）
  const lantern = new Group();
  lantern.position.set(0.42, 0.95, 0.28);
  lantern.add(at(new Mesh(new CylinderGeometry(0.015, 0.015, 0.5, 4), mats.darkWood), 0, 0.3, 0));
  lantern.add(at(new Mesh(new CylinderGeometry(0.15, 0.15, 0.14, 8), new MeshBasicMaterial({ color: 0x4f7ee8 })), 0, 0.06, 0));
  lantern.add(at(new Mesh(new CylinderGeometry(0.15, 0.13, 0.2, 8), new MeshBasicMaterial({ color: 0xff7a3c })), 0, -0.1, 0));
  const light = new PointLight(0xffb066, 4.5, 8, 1.3);
  light.position.set(0, 0, 0.1);
  lantern.add(light);
  body.add(lantern);

  return { root, body, head, ribbon, leftArm, rightArm, feet, lantern, light };
}

/** 도깨비：原創造型——藍皮膚、單角、虎紋腰布、拿著방망이。正面朝 +z。 */
export function makeDokkaebiModel() {
  const root = new Group();
  const skin = new MeshLambertMaterial({ color: 0x4d79c2 });
  const cloth = new MeshLambertMaterial({ color: 0xe0a030 });
  const stripe = new MeshLambertMaterial({ color: 0x2a1b10 });
  const eyeMat = new MeshBasicMaterial({ color: 0xfff27a });
  const ivory = new MeshLambertMaterial({ color: 0xf2e6c8 });

  root.add(at(new Mesh(new CapsuleGeometry(0.78, 0.9, 4, 12), skin), 0, 1.55, 0));
  root.add(at(new Mesh(new CylinderGeometry(0.84, 0.9, 0.55, 14), cloth), 0, 1.05, 0));
  for (let i = 0; i < 5; i++) {
    const s = at(new Mesh(new CylinderGeometry(0.86, 0.92, 0.07, 14, 1, true, i * 1.25, 0.35), stripe), 0, 1.05, 0);
    root.add(s);
  }
  for (const sx of [-1, 1]) {
    root.add(at(new Mesh(new CylinderGeometry(0.22, 0.25, 0.7, 8), skin), sx * 0.42, 0.35, 0));
    const arm = at(new Mesh(new CylinderGeometry(0.17, 0.2, 1.0, 8), skin), sx * 0.98, 1.7, 0.1);
    arm.rotation.z = sx * 0.5;
    root.add(arm);
  }

  const head = new Group();
  head.position.set(0, 2.8, 0);
  head.add(new Mesh(new SphereGeometry(0.64, 14, 12), skin));
  head.add(at(new Mesh(new IcosahedronGeometry(0.62, 0), mats.hair), 0, 0.12, -0.28));
  head.add(at(new Mesh(new ConeGeometry(0.17, 0.6, 8), ivory), 0, 0.78, 0.05));
  for (const sx of [-1, 1]) {
    head.add(at(new Mesh(new SphereGeometry(0.12, 8, 6), eyeMat), sx * 0.24, 0.1, 0.55));
    const tusk = at(new Mesh(new ConeGeometry(0.06, 0.2, 6), ivory), sx * 0.18, -0.32, 0.5);
    tusk.rotation.x = Math.PI;
    head.add(tusk);
  }
  head.add(at(new Mesh(new CylinderGeometry(0.28, 0.28, 0.08, 10), mats.black), 0, -0.25, 0.52));
  root.add(head);

  // 방망이（狼牙棒）
  const club = new Group();
  club.position.set(1.35, 1.3, 0.35);
  club.rotation.z = -0.5;
  club.add(at(new Mesh(new CylinderGeometry(0.28, 0.12, 1.5, 8), mats.wood), 0, 0.6, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    club.add(at(new Mesh(new SphereGeometry(0.07, 5, 4), ivory), Math.cos(a) * 0.26, 0.9 + (i % 2) * 0.3, Math.sin(a) * 0.26));
  }
  root.add(club);

  const glow = new PointLight(0x6fb7ff, 6, 9, 1.3);
  glow.position.set(0, 2.5, 1.4);
  root.add(glow);

  return { root, head, club };
}

/** 할머니：坐在마루上打盹的老奶奶。醒來後會站起來揮手。正面朝 +z。 */
export function makeGrandmaModel() {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const robe = new MeshLambertMaterial({ color: 0xc9c2b0 });
  const skirt = new MeshLambertMaterial({ color: 0x5a6a80 });
  const white = new MeshLambertMaterial({ color: 0xe2e8ef });
  body.add(at(new Mesh(new ConeGeometry(0.5, 0.8, 10), skirt), 0, 0.4, 0));
  body.add(at(new Mesh(new CylinderGeometry(0.22, 0.3, 0.45, 10), robe), 0, 0.98, 0));
  const head = new Group();
  head.position.set(0, 1.35, 0.04);
  head.add(new Mesh(new SphereGeometry(0.24, 12, 10), mats.skin));
  head.add(at(new Mesh(new SphereGeometry(0.25, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), white), 0, 0.03, -0.02));
  head.add(at(new Mesh(new SphereGeometry(0.11, 8, 6), white), 0, 0.02, -0.27)); // 髮髻
  head.add(at(new Mesh(new CylinderGeometry(0.015, 0.015, 0.34, 4), new MeshLambertMaterial({ color: 0xd9b24a })), 0, 0.02, -0.27)).rotation.z = Math.PI / 2;
  for (const sx of [-1, 1]) head.add(at(new Mesh(new SphereGeometry(0.03, 5, 4), mats.black), sx * 0.08, 0.02, 0.22));
  body.add(head);
  const arm = new Group();
  arm.position.set(0.26, 1.15, 0);
  const armGeom = new CylinderGeometry(0.06, 0.07, 0.42, 6);
  armGeom.translate(0, -0.21, 0);
  arm.add(new Mesh(armGeom, robe));
  arm.add(at(new Mesh(new SphereGeometry(0.06, 6, 5), mats.skin), 0, -0.44, 0));
  body.add(arm);
  return { root, body, head, arm };
}

/** 黑貓：尾巴會搖、眼睛會發光，嘴裡可以叼著감투。正面朝 +z。 */
export function makeCatModel() {
  const root = new Group();
  const fur = new MeshLambertMaterial({ color: 0x1a1a22 });
  const body = new Mesh(new SphereGeometry(0.22, 10, 8), fur);
  body.scale.set(0.9, 0.85, 1.4);
  root.add(at(body, 0, 0.24, 0));
  const head = new Group();
  head.position.set(0, 0.42, 0.28);
  head.add(new Mesh(new SphereGeometry(0.15, 10, 8), fur));
  for (const sx of [-1, 1]) {
    const ear = new Mesh(new ConeGeometry(0.06, 0.12, 4), fur);
    head.add(at(ear, sx * 0.08, 0.14, 0));
    head.add(at(new Mesh(new SphereGeometry(0.03, 6, 4), new MeshBasicMaterial({ color: 0xf2bd68 })), sx * 0.06, 0.03, 0.13));
  }
  const hat = new Group();
  const hatMat = new MeshLambertMaterial({ color: 0x0c0c10 });
  hat.add(at(new Mesh(new CylinderGeometry(0.1, 0.12, 0.08, 10), hatMat), 0, 0.04, 0));
  hat.add(at(new Mesh(new SphereGeometry(0.08, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), hatMat), 0, 0.08, 0));
  hat.position.set(0, -0.08, 0.16);
  head.add(hat);
  root.add(head);
  const tail = new Group();
  tail.position.set(0, 0.3, -0.3);
  let parent = tail;
  for (let i = 0; i < 4; i++) {
    const seg = new Group();
    seg.position.set(0, 0, i === 0 ? 0 : -0.1);
    seg.add(at(new Mesh(new SphereGeometry(0.045, 6, 4), fur), 0, 0, -0.05));
    parent.add(seg);
    parent = seg;
  }
  root.add(tail);
  return { root, head, tail, hat };
}
