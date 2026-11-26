import { DoubleSide, MeshBasicMaterial, MeshLambertMaterial } from 'three';

/** 共用材質。ASCII 畫面只看亮度和顏色，所以 Lambert 就夠了。 */
export const mats = {
  ground: new MeshLambertMaterial({ color: 0x26342a }),
  path: new MeshLambertMaterial({ color: 0x5c5548 }),
  stone: new MeshLambertMaterial({ color: 0x8e9096 }),
  darkStone: new MeshLambertMaterial({ color: 0x5b5d63 }),
  wall: new MeshLambertMaterial({ color: 0xd9d0bd }),
  wood: new MeshLambertMaterial({ color: 0x9a7650 }),
  darkWood: new MeshLambertMaterial({ color: 0x4d3724 }),
  roof: new MeshLambertMaterial({ color: 0x263c50, side: DoubleSide }),
  roofTile: new MeshLambertMaterial({ color: 0x3a5268 }),
  straw: new MeshLambertMaterial({ color: 0xc9b27a }),
  ridge: new MeshLambertMaterial({ color: 0xb9b6ae }),
  leaf: new MeshLambertMaterial({ color: 0x2f6a3e, flatShading: true }),
  pine: new MeshLambertMaterial({ color: 0x24533a, flatShading: true }),
  bark: new MeshLambertMaterial({ color: 0x5a4230 }),
  onggi: new MeshLambertMaterial({ color: 0x5c3a28 }),
  black: new MeshBasicMaterial({ color: 0x000000 }),
  paperGlow: new MeshBasicMaterial({ color: 0xffc46e }),
  paperDim: new MeshLambertMaterial({ color: 0xcfc4a8 }),
  wisp: new MeshBasicMaterial({ color: 0x7cc4ff }),
  moon: new MeshBasicMaterial({ color: 0xfff1c4 }),
  skin: new MeshLambertMaterial({ color: 0xf0cfae }),
  hair: new MeshLambertMaterial({ color: 0x1c1a1a }),
  robe: new MeshLambertMaterial({ color: 0xece6d8 }),
  jeogori: new MeshLambertMaterial({ color: 0xd04848 }),
};

/** 오방색（五方色）布條：青、赤、黃、白、黑 */
export const OBANGSAEK = [0x2f6fd9, 0xd94040, 0xe8c84a, 0xf2f2f2, 0x2b2b2b];
