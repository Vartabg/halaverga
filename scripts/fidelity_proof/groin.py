"""User-requested local correction of the existing proof, not a character rebuild."""
import bpy
import hashlib
import json
import numpy as np
import struct
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from common import ART, DOC, aim, lerp_table, smooth

NAME='Groin - smooth fitted contour'
OUTPUT=DOC/'groin-fix'
OUTPUT.mkdir(parents=True,exist_ok=True)


def other_meshes_hash(body):
    digest=hashlib.sha256()
    for obj in sorted(bpy.context.scene.objects,key=lambda o:o.name):
        if obj.type!='MESH' or obj==body: continue
        digest.update(obj.name.encode()); digest.update(str(list(obj.matrix_world)).encode())
        for vertex in obj.data.vertices: digest.update(struct.pack('<3f',*vertex.co))
    return digest.hexdigest()


def add_correction(body):
    fit=body.data.shape_keys.key_blocks['Reference silhouette - editable fit']
    correction=body.data.shape_keys.key_blocks.get(NAME) or body.shape_key_add(name=NAME,from_mix=False)
    correction.relative_key=fit
    changed=[]
    # Adjacent front surface is around 0.12 m deep; the old clamp put the
    # center at 0.065 m. Rejoin it with a gently convex fabric-like envelope.
    envelope=[(.94,.091),(.98,.110),(1.03,.132),(1.08,.139),(1.13,.142),(1.17,.153)]
    for index,(source,target) in enumerate(zip(fit.data,correction.data)):
        target.co=source.co
        x,height,depth=source.co
        if not (abs(x)<.135 and .94<height<1.17 and depth>.015): continue
        weight=(1-smooth(.045,.135,abs(x)))*smooth(.94,.99,height)
        weight*=1-smooth(1.115,1.17,height)
        weight*=smooth(.015,.05,depth)
        contour=lerp_table(envelope,height)-.60*x*x
        target.co.z+=max(0,contour-depth)*weight
        if (target.co-source.co).length>1e-7: changed.append(index)
    correction.value=1
    return correction,changed


def render_comparisons(correction):
    scene=bpy.context.scene
    data=bpy.data.cameras.new('Groin comparison'); data.type='ORTHO'; data.ortho_scale=.64
    camera=bpy.data.objects.new('Groin comparison',data); scene.collection.objects.link(camera)
    scene.camera=camera; scene.render.resolution_x=800; scene.render.resolution_y=900
    scene.render.resolution_percentage=100; scene.cycles.samples=32
    for view,position in [('front',(0,-5,1.07)),('oblique',(3,-5,1.07))]:
        camera.location=position; aim(camera,(0,0,1.07))
        images=[]
        for name,value in [('before',0),('after',1)]:
            correction.value=value; bpy.context.view_layer.update()
            path=OUTPUT/('groin-'+view+'-'+name+'.png')
            scene.render.filepath=str(path); bpy.ops.render.render(write_still=True)
            source=bpy.data.images.load(str(path),check_existing=False)
            pixels=np.empty(800*900*4,dtype=np.float32); source.pixels.foreach_get(pixels)
            pixels=pixels.reshape(900,800,4); alpha=pixels[:,:,3:4]
            pixels[:,:,:3]=pixels[:,:,:3]*alpha+.83*(1-alpha); pixels[:,:,3]=1
            images.append(pixels); bpy.data.images.remove(source)
        pair=np.concatenate(images,axis=1)
        image=bpy.data.images.new('Groin comparison '+view,width=1600,height=900,alpha=True)
        image.pixels.foreach_set(pair.ravel()); image.file_format='PNG'
        image.filepath_raw=str(OUTPUT/('groin-'+view+'-before-after.png')); image.save()
        bpy.data.images.remove(image)
    correction.value=1


body=bpy.data.objects['Studio anatomy - reference fit']
before=other_meshes_hash(body)
correction,changed=add_correction(body)
assert other_meshes_hash(body)==before, 'An unrelated mesh changed.'
bpy.context.scene['proof_stage']='groin-fix'
render_comparisons(correction)
report={'changed_vertices':len(changed),'other_meshes_unchanged':True,
        'other_meshes_sha256':before,'shape_key':NAME,
        'comparison_order':'before left, after right; same geometry except corrective key',
        'scope':'front pelvis depth only; no topology, limb, head, armor or runtime changes'}
(OUTPUT/'correction.json').write_text(json.dumps(report,indent=2)+'\n')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'character.blend'),compress=True)
print('[Groin] Local contour → saved with reversible shape key;',len(changed),'vertices adjusted.')
