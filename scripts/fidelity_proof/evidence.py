"""Source identity and reference alignment, independent of visual acceptance."""
import bpy
import hashlib
import struct
from common import REF, SCALE

BUNDLE_SHA256 = '9ce89bcde023a4a92e89c3339f9a8d1dadeea4392a15cebf94caa4050275d657'


def topology_hash(data):
    digest = hashlib.sha256()
    for polygon in data.polygons:
        digest.update(struct.pack('<I',len(polygon.vertices)))
        for index in polygon.vertices: digest.update(struct.pack('<I',index))
    return digest.hexdigest()


def aligned_references(image,collection):
    """Exact crops as viewport-only planes: sole Z=0 and crown Z=2 m.

    Full original image stays packed; UV cropping avoids reinterpreting or
    resampling the source. These planes never appear in proof renders.
    """
    for name,view in REF['views'].items():
        x0,y0,x1,y1 = view['crop']; axis = view['axis_x']
        left,right = (x0-axis)*SCALE,(x1-axis)*SCALE
        bottom,top = (941-y1)*SCALE,(941-y0)*SCALE
        if name=='front': vertices=[(left,.38,bottom),(right,.38,bottom),(right,.38,top),(left,.38,top)]
        elif name=='back': vertices=[(-left,-.38,bottom),(-right,-.38,bottom),(-right,-.38,top),(-left,-.38,top)]
        else: vertices=[(-.38,left,bottom),(-.38,right,bottom),(-.38,right,top),(-.38,left,top)]
        data=bpy.data.meshes.new('Reference plane '+name); data.from_pydata(vertices,[],[(0,1,2,3)])
        uv=data.uv_layers.new(name='Original concept crop')
        for loop,coordinate in zip(uv.data,[(x0/1536,1-y1/1024),(x1/1536,1-y1/1024),(x1/1536,1-y0/1024),(x0/1536,1-y0/1024)]):
            loop.uv=coordinate
        obj=bpy.data.objects.new('REFERENCE ONLY - '+name,data); collection.objects.link(obj)
        obj.hide_render=True; obj['reference_only']=True
        # Hidden by default so the initial viewport shows the actual proof mesh.
        obj.hide_set(True)
        material=bpy.data.materials.new('REFERENCE ONLY - '+name); material.use_nodes=True
        nodes=material.node_tree.nodes; nodes.clear()
        texture=nodes.new('ShaderNodeTexImage'); texture.image=image
        emission=nodes.new('ShaderNodeEmission'); output=nodes.new('ShaderNodeOutputMaterial')
        material.node_tree.links.new(texture.outputs['Color'],emission.inputs['Color'])
        material.node_tree.links.new(emission.outputs[0],output.inputs[0]); data.materials.append(material)
