"""Render fixed gray views of one reopened proof mesh and record its identity."""
import bpy
import hashlib
import json
import struct
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from common import DOC, REF, SCALE, aim
from evidence import topology_hash

scene = bpy.context.scene
# Rerunning the render script must not double the saved review lights/cameras.
for obj in list(scene.objects):
    if obj.type in {'CAMERA','LIGHT'}: bpy.data.objects.remove(obj,do_unlink=True)
revision = int(scene['proof_revision'])
stage=scene.get('proof_stage','pass-'+str(revision))
assert stage in {'pass-0','pass-1','pass-2','groin-fix'}
output = DOC/stage; output.mkdir(parents=True,exist_ok=True)
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.55,.55,.55,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .65
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
scene.render.resolution_percentage = 100
for name,pos,power,size in [('Soft key',(-3,-4,5),500,5),('Soft fill',(3,-2,3),350,4),('Rear fill',(0,4,4),400,5)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=pos; aim(obj,(0,0,1))


def geometry_hash():
    digest=hashlib.sha256()
    for obj in sorted(scene.objects,key=lambda o:o.name):
        if not obj.get('proof_geometry'): continue
        digest.update(obj.name.encode()); digest.update(str(list(obj.matrix_world)).encode())
        for v in obj.data.vertices: digest.update(struct.pack('<3f',*v.co))
        if obj.data.shape_keys:
            for key in obj.data.shape_keys.key_blocks:
                digest.update(struct.pack('<f',key.value))
                for p in key.data: digest.update(struct.pack('<3f',*p.co))
    return digest.hexdigest()


initial=geometry_hash(); manifest={}
for name in ['front','profile','back','bust-front','bust-profile','bust-three-quarter']:
    data=bpy.data.cameras.new('Review '+name); data.type='ORTHO'
    camera=bpy.data.objects.new('Review '+name,data); scene.collection.objects.link(camera); scene.camera=camera
    if name in REF['views']:
        view=REF['views'][name]; x0,y0,x1,y1=view['crop']
        width,height=x1-x0,y1-y0
        z=(941-(y0+y1)/2)*SCALE
        horizontal=((x0+x1)/2-view['axis_x'])*SCALE
        if name=='front': position=(horizontal,-8,z); target=(horizontal,0,z)
        elif name=='back': position=(-horizontal,8,z); target=(-horizontal,0,z)
        else: position=(8,horizontal,z); target=(0,horizontal,z)
        ortho=height*SCALE
    else:
        width,height=1000,1100; ortho=.87
        target=(0,0,1.627)
        position={'bust-front':(0,-5,1.627),'bust-profile':(5,0,1.627),'bust-three-quarter':(-3 if revision==2 else 3,-5,1.627)}[name]
    camera.location=position; aim(camera,target); camera.data.ortho_scale=ortho
    scene.render.resolution_x=width; scene.render.resolution_y=height
    scene.render.filepath=str(output/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    assert geometry_hash()==initial, 'Geometry changed between review cameras.'
    manifest[name]={'geometry_hash':initial,'size':[width,height],'camera':position,'target':target,'ortho_scale':ortho}
    camera['render_width']=width; camera['render_height']=height
(output/'renders.json').write_text(json.dumps(manifest,indent=2)+'\n')
if revision==2:
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
body=bpy.data.objects['Studio anatomy - reference fit']
proof_materials={m for o in scene.objects if o.get('proof_geometry') for m in o.data.materials if m}
audit={'blender_reopened':True,'blender_version':bpy.app.version_string,'revision':revision,
       'output_directory':stage,
       'blend_sha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),
       'packed_reference':any(i.packed_file and i.name=='explorer-reference.png' for i in bpy.data.images),
       'body_topology_preserved':len(body.data.vertices)==10582 and len(body.data.polygons)==10590 and topology_hash(body.data)==scene.get('source_topology_sha256'),
       'source_topology_sha256':scene.get('source_topology_sha256'),
       'no_image_materials':all(n.type!='TEX_IMAGE' for m in proof_materials if m.use_nodes for n in m.node_tree.nodes),
       'references_excluded_from_renders':all(o.hide_render for o in scene.objects if o.get('reference_only')),
       'no_rig':not any(o.type=='ARMATURE' for o in scene.objects),
       'same_geometry_across_views':len({v['geometry_hash'] for v in manifest.values()})==1,
       'runtime_hashes':json.loads(scene['runtime_hashes']), 'visual_approval':'pending owner review'}
(DOC/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print('[Proof] Reopened renders → six views, unchanged mesh, revision',revision)
