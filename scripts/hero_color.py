"""Bake the generated front portrait into compact head atlases in Blender."""
import bpy
from math import sin, cos, atan2, pi
from hero_skin import smooth
from suit_mesh import MATERIALS

LANDMARKS = [(.72,.119),(.748,.177),(.781,.29),(.808,.397),
             (.848,.538),(.868,.591),(.903,.773),(.981,.99)]
RADII = [(.72,.034),(.733,.05),(.749,.067),(.768,.076),
         (.808,.084),(.823,.086),(.858,.082),(.905,.081),(.937,.066),(.965,.01),(.981,.001)]


def interpolate(points,z):
    for (a,u),(b,v) in zip(points,points[1:]):
        if z <= b: return u+(v-u)*max(0,(z-a)/(b-a))
    return points[-1][1]


def bake_reference(objects,path):
    image = bpy.data.images.load(str(path)); image.pack(); image.use_fake_user = True
    width,height = image.size
    pixels = list(image.pixels)
    def sample(u,v):
        x,y = min(width-1,max(0,int(u*(width-1)))),min(height-1,max(0,int(v*(height-1))))
        return pixels[(y*width+x)*4:(y*width+x)*4+3]
    skin = sample(.365,.415)
    for name in ['skin','hair']:
        size = 256 if name == 'skin' else 128
        atlas = bpy.data.images.new('Explorer '+name+' atlas',width=size,height=size,alpha=False)
        atlas.colorspace_settings.name = image.colorspace_settings.name
        values = []
        for row in range(size):
            z = .72+.261*row/(size-1)
            for col in range(size):
                angle = col/(size-1)*2*pi-pi
                x = interpolate(RADII,z)*cos(angle)
                sampled = sample(.501+x*3.22,interpolate(LANDMARKS,z))
                amount = smooth(.4,.8,sin(angle))
                base = skin if name == 'skin' else [.09,.075,.065]
                rgb = [base[n]*(1-amount)+sampled[n]*amount for n in range(3)]
                if name == 'hair': rgb = [min(.25,c) for c in rgb]
                values.extend((*rgb,1))
        atlas.pixels.foreach_set(values); atlas.pack()
        mat = MATERIALS[name]; mat.diffuse_color = (1,1,1,1)
        texture = mat.node_tree.nodes.new('ShaderNodeTexImage'); texture.image = atlas
        mat.node_tree.links.new(texture.outputs['Color'],mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    for obj in objects:
        data = obj.data
        while data.uv_layers: data.uv_layers.remove(data.uv_layers[0])
        uv = data.uv_layers.new(name='ExplorerUV')
        data.uv_layers.active = uv
        for polygon in data.polygons:
            angles = [atan2(data.vertices[data.loops[i].vertex_index].co.y+.01,
                           data.vertices[data.loops[i].vertex_index].co.x) for i in polygon.loop_indices]
            wraps = max(angles)-min(angles) > pi
            for index,angle in zip(polygon.loop_indices,angles):
                p = data.vertices[data.loops[index].vertex_index].co
                if wraps and angle < 0: angle += 2*pi
                uv.data[index].uv = ((angle+pi)/(2*pi),max(0,min(1,(p.z-.72)/.261)))
