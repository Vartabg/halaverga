import { BACKDROP_SUN } from './backdropData';
import { SUN_UV } from './atmospherePalette';

export const BACKDROP_URL = '/textures/sky/hermon-dawn.jpg';
/** Turn about the vertical axis (radians) that carries the painted sun to SUN_POSITION's azimuth: the painted sun and the key light
 * agree. The sky sphere adds it to the equirect u, and the environment map is rotated by it. */
export const BACKDROP_TURN = (BACKDROP_SUN.u - SUN_UV[0]) * 2 * Math.PI;
