import { WORLD } from '@/game/motion';

const smooth = (lo: number, hi: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
const bell = (d: number, width: number) => Math.exp(-((d / width) ** 2));
const bed = (d: number, cut: number, back: number) => smooth(-cut, 0, d) * (1 - smooth(0, back, d));

/** The floor turns west into a blind snow hollow. The tilted beds on its sunny side run across the pass. */
export const hollowAxis = (z: number) => -31 + .105 * (z - 78) + 2.6 * Math.sin((z - 40) * .036);
export const shoulderAxis = (z: number) => 27 + .19 * (z - 48) + 2.8 * Math.sin((z - 24) * .038);

function shapePass(x: number, z: number, base: number) {
  if (z < -35 || z > 196 || x < -135 || x > 145) return base;
  const blend = smooth(-3, 22, z) * (1 - smooth(150, 196, z))
    * smooth(-135, -99, x) * (1 - smooth(109, 145, x));
  const dx = x - hollowAxis(z), r = Math.hypot(dx / 35, (z - 80) / 66);
  const sheltered = 1 - smooth(.52, 1.52, r);
  const snowbed = -2.9 + 4.7 * r * r + .75 * Math.sin(z * .055 + x * .035)
    + .55 * Math.sin(dx * .18 + z * .026 + Math.sin(z * .06));
  let y = base + (snowbed - base) * sheltered;

  // A scooped, open lip on the south side and a higher, hooked wall at its head.
  const wall = -67 + .14 * (z - 73) + 4 * Math.sin(z * .051);
  y += 22 * bell(x - wall, 14) * bell(z - 78, 61);
  const back = 27 + .013 * (x + 34) ** 2 - .14 * (x + 34);
  y += 14 * bell(z - back, 8) * bell(x + 40, 28);

  // Three differently eroded bedding planes emerge along one continuous shoulder.
  const across = x - shoulderAxis(z);
  y += 13 * bell(across - 23, 33) * bell(z - 42, 67);
  y += 8.3 * bed(across + 1, 3.3, 10) * bell(z - 50, 36) * (1 - .48 * bell(z - 62, 5));
  y += 12 * bed(across - 12 - 1.4 * Math.sin(z * .067), 3.6, 13) * bell(z - 62, 44);
  y += 10 * bed(across - 28 + 2 * Math.sin(z * .057), 4.1, 16) * bell(z - 40, 46);

  // Tie the existing landing shelf into the right bank. Its western toe leaves the snowbed open.
  const toe = smooth(-24, -4, x) * (1 - smooth(20, 53, x)) * bell(z - 62 + .27 * x, 32);
  y += Math.max(0, 17 - y) * toe;
  return base + (y - base) * blend;
}

/** A pair of long fore-ridges change the local skyline. Return to the surveyed ring's true rim in its last 30 m. */
export function passHeight(x: number, z: number, base: number) {
  const far = Math.max(smooth(120, 238, Math.abs(x)), smooth(92, 228, -z));
  const collar = smooth(0, 30, Math.min(x - WORLD.minX, WORLD.maxX - x, z - WORLD.minZ, WORLD.maxZ - z));
  const crest = -259 + .13 * x + 33 * Math.sin(x * .0062);
  const west = -265 - .27 * z + 27 * Math.sin(z * .009);
  const east = 201 + .16 * z + 16 * Math.sin(z * .012);
  const longRidges = 9 + 39 * bell(z - crest, 74) + 43 * bell(x - west, 83) + 35 * bell(x - east, 70)
    + 2 * Math.sin(x * .028 - z * .018) + 5 * Math.sin(z * .014 + x * .005);
  let y = base + (longRidges - base) * far * collar * .95;
  const valley = -21 + .22 * (z + 104) + 13 * Math.sin(z * .017);
  y -= 55 * bell(x - valley, 53 - .065 * Math.min(0, z)) * smooth(50, 166, -z) * collar;
  // Follow the dry valley down through the arch. The longer east ridge turns away from the opening.
  const below = (1 - smooth(-32, 0, z)) * smooth(-203, -123, z) * (1 - smooth(115, 181, Math.abs(x)));
  const floor = -3 - 15 * smooth(0, 141, -z);
  const benches = floor + 35 * bell(x - 83 + z * .23, 44) + 26 * bell(x + 98 + z * .13, 49)
    + 5 * Math.sin(x * .024 - z * .029) * smooth(0, 79, Math.abs(x)) + 3 * Math.sin(z * .047);
  y += (benches - y) * below;
  y = shapePass(x, z, y);
  // The west foot rests on a long dipping bed; the east tip disappears into a steeper spur.
  const westBed = bell(x + 37 + .25 * z + 1.8 * Math.sin(z * .09), 17) * bell(z - 1, 25);
  const eastBed = bell(x - 35 - .25 * z - 1.5 * Math.sin(z * .11), 13) * bell(z + 2, 19);
  const footing = Math.max(westBed, eastBed);
  y += Math.max(0, 13.3 * westBed + 15.4 * eastBed - y) * smooth(.1, .63, footing);
  const camp = Math.hypot((x + 33) / 13, (z + 45) / 10);
  return y + (2.65 - y) * (1 - smooth(.98, 2.45, camp));
}

/** Signed exposure for the common limestone material: settled snow in the lee, exposed beds on the shoulder. */
export function passSnowCover(x: number, z: number) {
  if (x < -100 || x > 120 || z < -16 || z > 174) return 0;
  const hollow = Math.hypot((x - hollowAxis(z)) / 36, (z - 78) / 73);
  const shoulder = Math.hypot((x - shoulderAxis(z) - 16) / 40, (z - 45) / 60);
  return (1 - smooth(.65, 1.28, hollow)) - (1 - smooth(.65, 1.22, shoulder));
}
