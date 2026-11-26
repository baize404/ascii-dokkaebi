import {
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

/** 提著燈籠的孩子（玩家）。模型正面朝 +z。 */
export function makePlayerModel() {
  const root = new Group();
  const body = new Group();
  root.add(body);

  body.add(at(new Mesh(new ConeGeometry(0.46, 0.95, 10), mats.robe), 0, 0.48, 0));
  body.add(at(new Mesh(new CylinderGeometry(0.2, 0.28, 0.42, 10), mats.jeogori), 0, 1.1, 0));
  body.add(at(new Mesh(new SphereGeometry(0.27, 12, 10), mats.skin), 0, 1.55, 0));
  body.add(at(new Mesh(new SphereGeometry(0.29, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.hair), 0, 1.58, -0.02));
  body.add(at(new Mesh(new SphereGeometry(0.1, 6, 6), mats.hair), 0, 1.5, -0.3));

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

  return { root, body, lantern, light };
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
