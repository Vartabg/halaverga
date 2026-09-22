import { BufferGeometry, Float32BufferAttribute } from 'three';
import { colors, type Kit } from './kit';

/** Low-cost silhouette outside the surveyed district, not additional playable land. */
export function distantTerrain(k: Kit) {
  const positions: number[]=[], uv: number[]=[];
  const count=96;
  const point=(i:number,outer:boolean): [number,number,number] => {
    const a=i/count*Math.PI*2;
    const ridge=48+Math.sin(a*5+1)*18+Math.sin(a*11)*12+Math.sin(a*23)*5;
    const radius=outer ? 1.42 : 1;
    return [Math.cos(a)*255*radius,outer ? ridge : -4,Math.sin(a)*295*radius-40];
  };
  for(let i=0;i<count;i++) {
    const a=point(i,false),b=point(i+1,false),c=point(i,true),d=point(i+1,true);
    for(const p of [a,b,c,b,d,c]) {positions.push(...p);uv.push(p[0]/20,p[2]/20);}
  }
  const terrain=new BufferGeometry();
  terrain.setAttribute('position',new Float32BufferAttribute(positions,3));
  terrain.setIndex(Array.from({length:positions.length/3},(_,i)=>i));
  terrain.setAttribute('uv',new Float32BufferAttribute(uv,2));terrain.computeVertexNormals();
  k.add(terrain,'#595961');
  // Retreated residential districts climb the hills in interrupted terraces.
  for(const side of [-1,1]) for(let i=0;i<15;i++) {
    const x=side*(220+(i%3)*15),z=-195+i*21,h=9+(i*7%19),base=8+(i%3)*6;
    k.box(x,base+h/2,z,10+i%4,h,12,'#777477');
    k.box(x-side*3,base+h+2,z-2,4,4,8,'#777477');
    for(let f=0;f<3;f++) k.box(x,base+3+f*3.5,z+6.05,8,.55,.1,colors.edge);
    if(i%3===0) k.box(x+4,base+h+2,z+3,.14,6,.14,colors.steel);
  }
}
