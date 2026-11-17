"""Paint the Hermon dawn backdrop from a Poly Haven (CC0) HDRI, headless.

  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
      --python scripts/art/paint_hermon_sky.py -- <raw.hdr> [out_dir] [--preview]

Input: the 4k equirect HDRI (docs/art/hermon-sky/PROVENANCE.md names it). Output, relative to the repo root:
  public/textures/sky/hermon-dawn.jpg      2048x1024 equirect (--width=4096 for 4096x2048), quality 85
  src/world/backdropData.ts                 where the sun sits in the image
Steps: exposure and filmic tone map, a dawn grade, deepen the zenith toward the dawn palette, fade the low sky and the whole lower
hemisphere to the constant HAZE (display sRGB, the fog colour) so the fog meets the sky with no line, Kuwahara (anisotropic) in
the compositor, then sparse fading stars. Only the
processed JPEG ships; the raw HDRI never enters the repo.
"""
import json, math, os, sys
import bpy
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
flags = [a for a in argv if a.startswith('--')]
args = [a for a in argv if not a.startswith('--')]
if not args:
    sys.exit('usage: Blender --background --factory-startup --python paint_hermon_sky.py -- <raw.hdr> [out_dir] [--preview]')
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.abspath(args[1]) if len(args) > 1 else ROOT
W = next((int(a.split('=')[1]) for a in flags if a.startswith('--width=')), 2048); H = W // 2
HAZE = '#d6c2d0'  # keep equal to HAZE in src/world/atmospherePalette.ts
rng = np.random.default_rng(1)  # the stars are the same every run

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def hex_lin(h):
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)

def lin_hex(c):
    c = np.clip(c, 0, 1)
    s = np.where(c <= .0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - .055)
    return '#' + ''.join('%02x' % int(round(v * 255)) for v in s)

def blur_wrap(a, k):
    """Circular box blur along the azimuth (axis 1), window of k pixels (k even)."""
    p = k // 2
    pad = np.concatenate([a[:, -p:], a, a[:, :p]], axis=1)
    cs = np.concatenate([np.zeros_like(pad[:, :1]), np.cumsum(pad, axis=1, dtype=np.float64)], axis=1)
    return ((cs[:, 2 * p: 2 * p + a.shape[1]] - cs[:, :a.shape[1]]) / (2 * p)).astype(np.float32)

# 1. Load the HDRI as linear rgb, top row first.
src = bpy.data.images.load(args[0])
w0, h0 = src.size
px = np.empty(w0 * h0 * 4, dtype=np.float32)
src.pixels.foreach_get(px)
img = np.flipud(px.reshape(h0, w0, 4)[:, :, :3])
if (w0, h0) != (W, H):
    f = w0 // W
    img = img[:H * f, :W * f].reshape(H, f, W, f, 3).mean(axis=(1, 3))
lum = img @ np.array([.2126, .7152, .0722])
sy, sx = np.unravel_index(np.argmax(blur_wrap(lum, 9)), lum.shape)
sun_u, sun_el = (sx + .5) / W, (.5 - (sy + .5) / H) * 180

# 2. Tone map (ACES fit, exposure for a dusk sky) to display-linear.
x = img * .5
img = np.clip((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0, 1)
el = (.5 - (np.arange(H) + .5) / H) * 180  # degrees, +90 at the top row
el2 = el[:, None]

# 3. The dawn grade (cool violet shadows, warm highlights), then the vault: the photo's pale periwinkle zenith deepens to the
# palette's violet-blue, where the stars show.
g = img.mean(axis=2, keepdims=True)
img = g + (img - g) * 1.35  # dusk skies read paler than they were; bring the colour back
img = np.clip(img * np.array([1.04, 1.0, .95]) + np.array([-.004, -.006, .01]) * (1 - img), 0, 1)
zen = hex_lin('#232a52')
w = (smooth(8, 70, el2) * .85)[:, :, None]
img = img * (1 - w) + zen * w

# The photo's far ranges are rust red; the dawn range is cool: pull the low band toward a lavender-grey of the same brightness.
g = img @ np.array([.2126, .7152, .0722])
cool = g[:, :, None] * np.array([.92, .88, 1.08])
rw = (smooth(-1, 1, el2) * (1 - smooth(9, 16, el2)) * .92)[:, :, None]
img = img * (1 - rw) + cool * rw

# 4. The constant HAZE: the whole lower hemisphere and the low sky up to about 6 degrees fade to it, so the fog (one colour,
# HAZE) meets the backdrop at every azimuth. The ranges stand in it as faint silhouettes. Applied after the grade, so exact.
m = (1 - smooth(-1, 7, el2))[:, :, None]
img = img * (1 - m) + hex_lin(HAZE) * m
src_pixels = np.dstack([img, np.ones((H, W), np.float32)])

# 5. Compositor: Kuwahara (anisotropic) then stars added on top.
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = W, H, 100
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.display_settings.display_device = 'sRGB'
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam

def make_image(name, rgba):
    im = bpy.data.images.new(name, W, H, float_buffer=True, alpha=True)
    im.colorspace_settings.name = 'Linear Rec.709'
    im.pixels.foreach_set(np.flipud(rgba).astype(np.float32).ravel())
    im.update()
    return im

base_img = make_image('base', src_pixels)

# Stars: uniform on the sphere, kept to the upper sky, faded toward the horizon and the risen sun, never on the mist.
n = 900
az = rng.uniform(0, 2 * math.pi, n); s = rng.uniform(math.sin(math.radians(12)), 1, n); e = np.degrees(np.arcsin(s))
sx_ = ((az / (2 * math.pi)) * W).astype(int) % W; sy_ = ((.5 - e / 180) * H).astype(int)
du = np.abs(((az / (2 * math.pi)) - sun_u + .5) % 1 - .5)
bright = rng.uniform(.3, 1, n) * smooth(14, 55, e) * (.35 + .65 * smooth(.08, .45, du))
stars = np.zeros((H, W, 3), np.float32)
k = np.exp(-((np.arange(-2, 3)[:, None] ** 2 + np.arange(-2, 3)[None, :] ** 2) / (1.6 * W / 4096)))
for i in range(n):
    y, xx = sy_[i], sx_[i]
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if 0 <= y + dy < H:
                stars[y + dy, (xx + dx) % W] += bright[i] * k[dy + 2, dx + 2] * np.array([.55, .6, .85])
star_img = make_image('stars', np.dstack([stars, np.ones((H, W), np.float32)]))

scene.use_nodes = True
nt = scene.node_tree
for node in list(nt.nodes): nt.nodes.remove(node)
n_base = nt.nodes.new('CompositorNodeImage'); n_base.image = base_img
n_star = nt.nodes.new('CompositorNodeImage'); n_star.image = star_img
kuw = nt.nodes.new('CompositorNodeKuwahara')
kuw.variation, kuw.size, kuw.uniformity, kuw.sharpness, kuw.eccentricity = 'ANISOTROPIC', 4 if W < 4096 else 7, 4, .7, 1.0
mix = nt.nodes.new('CompositorNodeMixRGB'); mix.blend_type = 'ADD'; mix.inputs[0].default_value = 1
comp = nt.nodes.new('CompositorNodeComposite')
nt.links.new(n_base.outputs['Image'], kuw.inputs['Image'])
nt.links.new(kuw.outputs['Image'], mix.inputs[1])
nt.links.new(n_star.outputs['Image'], mix.inputs[2])
nt.links.new(mix.outputs['Image'], comp.inputs['Image'])

path = os.path.join(OUT, 'public', 'textures', 'sky', 'hermon-dawn.jpg')
os.makedirs(os.path.dirname(path), exist_ok=True)
scene.render.filepath = path
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 85
scene.render.image_settings.color_mode = 'RGB'
bpy.ops.render.render(write_still=True)

# 6. Where the sun sits in the image (the scene rotates the backdrop so it agrees with SUN_POSITION).
data = f"""// Generated by scripts/art/paint_hermon_sky.py. Do not edit by hand: run the script again.
/** Where the risen sun sits in the backdrop image (u across, 0 to 1, left edge 0; elevation in degrees). */
export const BACKDROP_SUN = {{ u: {sun_u:.4f}, elevation: {sun_el:.2f} }};
"""
os.makedirs(os.path.join(OUT, 'src', 'world'), exist_ok=True)
with open(os.path.join(OUT, 'src', 'world', 'backdropData.ts'), 'w') as f:
    f.write(data)
print('SUN', sun_u, sun_el, 'BYTES', os.path.getsize(path))
