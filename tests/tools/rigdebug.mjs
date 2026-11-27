import { Vector3 } from 'three';
import { makePlayerModel } from '../../src/world/characters.js';
const m = makePlayerModel();
m.root.updateMatrixWorld(true);
const mesh = m.mesh;
const v = new Vector3();
const report = (label) => {
  const pos = mesh.geometry.attributes.position;
  let minY = 9, maxY = -9, bminY = 9, bmaxY = -9;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const by = v.y;
    mesh.getVertexPosition(i, v);
    bminY = Math.min(bminY, by); bmaxY = Math.max(bmaxY, by);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  const sk = ['Skirt.F','Skirt.L'].map(n => m.bones[n].getWorldPosition(new Vector3()).toArray().map(x=>x.toFixed(2)).join(','));
  console.log(label, 'bind y', bminY.toFixed(2), bmaxY.toFixed(2), '| skinned y', minY.toFixed(2), maxY.toFixed(2), '| skirt bones', sk.join(' / '), '| pelvis', m.bones.Pelvis.position.y.toFixed(3));
};
report('建立後');
for (let i = 0; i < 30; i++) { m.animator.setMove(0, 0); m.animator.update(1/30); }
report('30 幀後');
// 找裙襬最低點
const pos = mesh.geometry.attributes.position;
let hem = 9;
for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (Math.hypot(v.x, v.z) > 0.3) { const b = v.y; mesh.getVertexPosition(i, v); hem = Math.min(hem, v.y); } }
console.log('半徑>0.3 的頂點（裙襬）蒙皮後最低 y =', hem.toFixed(3));
const hip = m.bones['Hip.L'].getWorldPosition(new Vector3()); const ank = m.bones['Ankle.L'].getWorldPosition(new Vector3());
console.log('髖', hip.toArray().map(x=>x.toFixed(2)), '踝', ank.toArray().map(x=>x.toFixed(2)), '頭', m.bones.Head.getWorldPosition(new Vector3()).toArray().map(x=>x.toFixed(2)));
