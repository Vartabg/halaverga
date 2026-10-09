/** An unbroken storm ceiling, with a low shelf and distant rain curtains. No animation or extra pass. */
export const productionSky = `
  varying vec3 vDirection; uniform vec3 haze;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
  float fbm(vec2 p){float n=0.,a=.52;mat2 m=mat2(.8,-.6,.6,.8);
    for(int i=0;i<5;i++){n+=a*noise(p);p=m*p*2.03+17.1;a*=.49;}return n;}
  void main(){
    vec3 dir=normalize(vDirection);float h=max(dir.y,0.);
    vec2 p=dir.xz/max(.12,dir.y+.16)*1.1;
    vec2 warp=vec2(noise(p*.7+2.1),noise(p*.7+7.8))-.5;
    float mass=fbm(p+warp*1.8+vec2(2.1,7.8));
    float detail=fbm(p*6.8+warp+3.);
    float density=smoothstep(.32,.7,mass+detail*.22);
    float backlight=pow(max(dot(dir,normalize(vec3(-.5,.32,-.8))),0.),6.);
    vec3 lit=mix(vec3(.145,.18,.195),vec3(.29,.32,.32),backlight*.55);
    vec3 underside=mix(vec3(.019,.026,.038),vec3(.09,.106,.12),smoothstep(.3,.68,detail));
    vec3 color=mix(lit,underside,density);
    // A torn lower shelf breaks the sky into heavy overlapping cloud banks.
    float shelf=smoothstep(.44,.67,fbm(p*.57+vec2(11.,-4.)));
    color=mix(color,vec3(.025,.032,.044),shelf*.72*smoothstep(.015,.22,h));
    // Narrow, uneven rain shafts sit behind the skyline, never in the flight corridor.
    vec2 bearing=normalize(dir.xz+vec2(.0001));
    float rain=noise(bearing*18.+2.)*noise(bearing*47.+5.);
    vec3 horizon=haze*(1.-rain*.25*smoothstep(.01,.08,h));
    color=mix(horizon,color,smoothstep(.015,.3,h));
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
