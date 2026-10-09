/** Storm-cleared atmosphere. Static weather respects reduced motion and needs no extra render pass. */
export const productionSky = `
  varying vec3 vWorld; uniform vec3 sun;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
  float fbm(vec2 p){float n=0.,a=.52;mat2 m=mat2(.8,-.6,.6,.8);
    for(int i=0;i<5;i++){n+=a*noise(p);p=m*p*2.03+17.1;a*=.49;}return n;}
  void main(){
    vec3 dir=normalize(vWorld);float h=max(dir.y,0.),s=max(dot(dir,sun),0.);
    vec3 horizon=mix(vec3(.34,.43,.53),vec3(.78,.59,.38),pow(s,5.)*.7);
    vec3 color=mix(horizon,vec3(.055,.13,.23),pow(h,.55));
    color+=vec3(.78,.49,.2)*pow(s,24.);
    vec2 p=dir.xz/max(.14,dir.y+.12)*1.45;
    float mass=fbm(p+vec2(2.1,7.8));
    float detail=fbm(p*3.2+3.);
    float cloud=smoothstep(.39,.68,mass+detail*.13)*smoothstep(.02,.18,h);
    float rim=smoothstep(.35,.54,mass)*(1.-smoothstep(.54,.64,mass));
    vec3 cloudColor=mix(vec3(.105,.15,.22),vec3(.55,.57,.58),detail);
    cloudColor+=vec3(.8,.53,.24)*pow(s,8.)*rim;
    color=mix(color,cloudColor,cloud*.9);
    color+=vec3(2.2,1.6,.72)*pow(s,160.)*(1.-cloud*.8);
    color=mix(color,vec3(5.,3.8,2.1),smoothstep(.99965,.99985,s)*(1.-cloud));
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
