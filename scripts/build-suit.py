"""Original Halaverga human hero: continuous fitted surface, expressive anatomy."""
import bpy
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from suit_mesh import material, seam, MATERIALS
from hero_anatomy import anatomy, volume
from hero_skin import bind, smooth

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
material('ceramic', (.36,.49,.52), .44, .2)
material('textile', (.025,.074,.083), .57, .1)
material('visor', (.009,.02,.027), .23, .1)
material('energy', (.035,.63,.44), .3, .1, 1.3)
material('copper', (.31,.18,.086), .33, .5)
material('skin', (.36,.18,.105), .64)
material('hair', (.019,.025,.026), .8)
material('eyes', (.66,.71,.68), .38)
body = anatomy()
# A continuous finish lets anatomy define the silhouette instead of armor islands.
body.data.materials.clear()
body.data.materials.append(MATERIALS['ceramic'])
body.data.materials.append(MATERIALS['skin'])
body.data.materials.append(MATERIALS['hair'])
for face in body.data.polygons:
    x,y,z = face.center
    hairline = .802 + .089*smooth(-.07,.09,y)
    face.material_index = 2 if z > hairline else 1 if z > .666 else 0
for s in [-1,1]:
    volume('Human eye', (s*.043,.122,.821), (.024,.009,.008), finish='eyes')
    volume('Iris glint', (s*.043,.131,.821), (.008,.003,.006), finish='visor')
    volume('Ear inset', (s*.115,.006,.805), (.005,.009,.018), finish='textile')
    seam('Brow edge', [(s*.02,.126,.837),(s*.043,.132,.843),(s*.065,.117,.838)], 'textile',1,.002)
    seam('Glove fingers', [(s*.305,.065,-.34),(s*.355,.065,-.34)], 'textile',7 if s>0 else 6,.0015)
    # A quiet shoulder-to-spine seam distinguishes the back in the actual camera.
    seam('Back contour', [(s*.20,-.102,.50),(s*.14,-.143,.435),(s*.07,-.15,.41)], 'copper',radius=.0025)
    seam('Calf channel', [(s*.12,-.101,-.69),(s*.12,-.094,-.78)], 'energy',9 if s>0 else 8,.002)
seam('Mouth', [(-.028,.124,.752),(0,.132,.75),(.028,.124,.752)], 'textile',1,.0018)
seam('Spine light', [(0,-.124,.50),(0,-.146,.37),(0,-.128,.24)], 'energy',radius=.0025)
# Small original sternum symbol, inset into the suit, rather than a superhero logo.
seam('Sternum signal', [(-.018,.154,.439),(0,.17,.46),(.018,.154,.439),(0,.17,.415),(-.018,.154,.439)],'energy',radius=.002)
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = body
bpy.ops.object.convert(target='MESH')
objects = [obj for obj in bpy.context.scene.objects if obj.type=='MESH']
# Export material primitives within an eight-batch budget.
for obj in objects: obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body = bpy.context.object
body.data.validate(verbose=True)
body.data.update()
bind([body])
destination = Path(__file__).resolve().parents[1] / 'public/models/suit.glb'
bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', export_yup=True,
    export_extras=True, export_texcoords=False, export_normals=True, export_animations=False)
print('[Human suit] Export →', destination.stat().st_size, 'bytes')
