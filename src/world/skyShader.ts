import { Color, Vector3 } from 'three';
import { atmosphere } from './atmospherePalette';
export function skyUniforms() {
  return {
    sun: { value: new Vector3(...atmosphere.sun).normalize() },
    horizon: { value: new Color(atmosphere.horizon) }, zenith: { value: new Color(atmosphere.zenith) },
    cloudColor: { value: new Color(atmosphere.cloud) }, cloudRim: { value: new Color(atmosphere.cloudRim) },
    sunColor: { value: new Color(atmosphere.sunColor) }, time: { value: 0 },
  };
}
/** Shared by the visible dome and water: the reflection carries the same weather. */
export const skyRadiance = `
uniform vec3 sun, horizon, zenith, cloudColor, cloudRim, sunColor;
uniform float time;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float weather(vec2 p){return noise(p)*.55+noise(p*2.03+13.1)*.28+noise(p*4.07-7.3)*.17;}
vec3 skyRadiance(vec3 dir){
  float h=max(dir.y,0.), alignment=max(dot(dir,sun),0.);
  vec3 color=mix(horizon,zenith,pow(h,.55));
  float glow=pow(alignment,12.);
  color+=sunColor*glow*.18;
  vec2 p=dir.xz/(h+.32)*2.4+vec2(time*.0018,0.);
  float cloud=weather(p+weather(p*.7)*1.1);
  float cover=smoothstep(.32,.7,cloud)*smoothstep(.015,.17,h);
  vec3 bank=mix(cloudColor,cloudRim,glow*.7+smoothstep(.53,.72,cloud)*.16);
  color=mix(color,bank,cover*.88);
  float disc=smoothstep(.99955,.9998,alignment)*(1.-cover*.9);
  color+=sunColor*(disc*1.6+pow(alignment,70.)*.13);
  return color;
}`;
