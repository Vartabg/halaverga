import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Color, DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType, PMREMGenerator, RGBAFormat, Vector3 } from 'three';
import { atmosphere } from './atmospherePalette';

/** A small shared overcast reflection, generated once. No second scene render per frame. */
export default function EnvironmentLight() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const width=256, height=128, data=new Uint16Array(width*height*4);
    const horizon=new Color(atmosphere.horizon), zenith=new Color(atmosphere.zenith);
    const ground=new Color(atmosphere.ground), light=new Color(atmosphere.sunColor);
    const sun=new Vector3(...atmosphere.sun).normalize(), direction=new Vector3(), color=new Color();
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const latitude=(y/height-.5)*Math.PI, longitude=(x/width-.5)*Math.PI*2;
      direction.set(Math.cos(latitude)*Math.cos(longitude),Math.sin(latitude),Math.cos(latitude)*Math.sin(longitude));
      const h=Math.max(0,direction.y), glow=Math.pow(Math.max(0,direction.dot(sun)),40);
      color.copy(direction.y<0 ? ground : horizon);
      if(direction.y>=0) color.lerp(zenith,Math.pow(h,.55));
      color.r+=light.r*glow*.75; color.g+=light.g*glow*.75; color.b+=light.b*glow*.75;
      const i=(y*width+x)*4;
      data[i]=DataUtils.toHalfFloat(color.r); data[i+1]=DataUtils.toHalfFloat(color.g);
      data[i+2]=DataUtils.toHalfFloat(color.b); data[i+3]=DataUtils.toHalfFloat(1);
    }
    const source=new DataTexture(data,width,height,RGBAFormat,HalfFloatType);
    source.mapping=EquirectangularReflectionMapping; source.needsUpdate=true;
    const generator=new PMREMGenerator(gl), target=generator.fromEquirectangular(source);
    const previous=scene.environment, intensity=scene.environmentIntensity;
    scene.environment=target.texture; scene.environmentIntensity=.65;
    source.dispose(); generator.dispose(); invalidate();
    return () => {scene.environment=previous;scene.environmentIntensity=intensity;target.dispose();};
  },[gl,scene,invalidate]);
  return null;
}
