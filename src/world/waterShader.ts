import { skyRadiance } from './skyShader';
export const waterFragment = `
${skyRadiance}
varying vec3 vWorld;
uniform vec3 waterColor, siltColor;
uniform vec2 wake;
uniform float wakeStrength;
void main(){
  vec2 p=vWorld.xz;
  float distortion=weather(p*.12)*6.;
  float a=p.x*.48+p.y*.81+time*.45+distortion;
  float b=p.x*1.65-p.y*.58-time*.62+distortion*1.7;
  float c=p.x*4.3+p.y*2.7+time*.7;
  // Fade unresolved ripples instead of allowing distant shimmer and stripes.
  float fine=1.-smoothstep(.35,1.5,fwidth(c));
  float swell=1.-smoothstep(.7,2.,fwidth(a));
  vec3 n=normalize(vec3((cos(a)*.016+cos(b)*.008)*swell,1.,sin(a)*.014*swell+sin(c)*.005*fine));
  vec3 view=normalize(cameraPosition-vWorld), reflected=reflect(-view,n);
  float fresnel=.045+.6*pow(1.-max(dot(n,view),0.),4.);
  float sediment=weather(p*.055+vec2(time*.003,0.));
  vec3 depth=mix(waterColor*.7,waterColor*1.28,sediment);
  vec3 color=mix(depth,skyRadiance(reflected),fresnel);
  // Stagnant, broken silt ribbons collect against the retaining walls.
  float bank=exp(-abs(abs(p.x)-14.4)*.85)*smoothstep(-160.,-145.,p.y)*(1.-smoothstep(66.,77.,p.y));
  float scum=smoothstep(.46,.69,weather(p*vec2(.65,.18)+time*.002));
  color=mix(color,siltColor,bank*scum*.54);
  color*=1.-bank*.16;
  float ripple=pow(max(0.,sin(a)*sin(b)),8.);
  color+=sunColor*ripple*.012;
  float wd=length(p-wake);
  color+=siltColor*wakeStrength*exp(-wd*.28)*pow(max(0.,sin(wd*5.-time*7.)),6.)*.55;
  float d=distance(cameraPosition,vWorld);
  color=mix(color,horizon,smoothstep(110.,410.,d));
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
