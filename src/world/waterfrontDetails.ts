import { colors, type Kit } from './kit';

/** Abandoned modern infrastructure; leave the middle of the flight corridor open. */
export function waterfrontDetails(k: Kit) {
  for (const side of [-1, 1]) {
    for (let i=0;i<12;i++) {
      const z=63-i*18, x=side*18.8;
      // Raised broken curb, expansion joints and the foundations of street furniture.
      k.box(side*18.5,2.14,z,3,.16,15.8,'#999588');
      k.box(side*20.05,2.24,z,.22,.32,15.3,colors.concrete);
      if(i%3!==1) {
        const lean=side*(i%2 ? .09 : -.035), top=x-Math.sin(lean)*3.2;
        k.box(x,5.25,z,.15,6.3,.15,colors.steel,true,0,lean);
        k.box(top-side*.65,8.32,z,1.65,.12,.22,colors.steel,false,0,lean);
        k.box(top-side*1.25,8.24,z,.65,.12,.4,'#736e5e');
      }
      // Buckled quay railing: missing sections and oxidized rails.
      if(i%4!==2) {
        for(const dz of [-2.5,2.5]) k.box(side*15.3,3.18,z+dz,.1,1.7,.1,colors.steel);
        k.box(side*15.3,3.9,z,.12,.1,5.2,colors.steel,false,0,side*.035);
      }
      // Waterline remnants stay tucked beside the banks, below the skim path.
      for(let j=0;j<1+i%3;j++) {
        const zz=z+Math.sin(i*13.4+j*7.3+side)*4.6, xx=side*(12.4+(i+j)%3*.48);
        k.box(xx,.12,zz,.65,.22,1.8,'#6e6656',false,i*.7+j,.09);
        k.box(side*14.54,.83+(j%2)*.35,zz,.08,.7,.2,'#70543e');
      }
      if(i%3===0) {
        // Ladder disappearing into the flood; slim visual details on the wall.
        for(const dz of [-.42,.42]) k.box(side*14.48,1.55,z+dz,.1,3.2,.08,colors.steel);
        for(let r=0;r<8;r++) k.box(side*14.39,.15+r*.4,z,.12,.07,.9,colors.steel);
      }
    }
    // A pair of surviving quay stair flights has lost its lower landing to water.
    const stairZ=side<0 ? 43 : -65;
    for(let s=0;s<6;s++) k.box(side*(13.2-s*.52),1.8-s*.29,stairZ,.58,.3,3.7,colors.concrete,true);
    // Scattered service cabinets with missing doors.
    for(const z of [37,-55,-127]) {
      k.box(side*20.8,2.7,z,1.1,1.25,.65,colors.steel,true);
      k.box(side*20.8,2.75,z+.34,.8,.87,.05,'#292e31');
      k.box(side*21.6,2.22,z+.7,.9,.09,1.1,'#756653',false,.4);
    }
  }
  // A submerged transit shelter reads as a recognizable fragment of ordinary life.
  k.box(23.5,2.24,-65,3.6,.28,8.5,colors.concrete,true);
  for(const z of [-68,-62]) k.box(24.7,3.7,z,.12,3,.15,colors.steel,true);
  k.box(23.5,5.25,-65,3.8,.16,8.8,'#6c756d',true,0,.035);
  k.box(24.75,3.65,-66,.08,2.5,3.5,colors.glass);
  k.box(23.7,2.85,-65,.85,.15,4.2,'#6f6351',true);
  // Fallen flood barriers on the broad road edges, away from the arrival landing.
  for(let i=0;i<9;i++) {
    const x=(i%2 ? -1 : 1)*(26+i%3*1.8), z=58-i*23;
    k.box(x,2.5,z,2.8,.72,.7,colors.concrete,true,i*.42,.08);
    for(let stripe=0;stripe<3;stripe++) k.box(x-1+stripe*.8,2.88,z,.24,.025,.64,'#ad8b56',false,i*.42);
  }
}
