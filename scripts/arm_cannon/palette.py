"""Palette atlas for the arm cannon: three 8x8 PNGs (base colour, glTF metal-roughness, emissive mask), nearest filtered,
the one 'cannon' material that reads them, and the Blender meshes whose faces are bound to palette slots.

Every part owns a 2x2 texel block, so mip level 1 still returns the exact part colour. Faces sample the centre of their
block's first texel. The PNG writer is deterministic (no timestamps), so two builds give identical bytes. bpy is imported
lazily so the palette maths also runs outside Blender."""
from math import radians
import struct
import zlib
from pathlib import Path

SIZE = 8
R, G, B = (255, 0, 0), (0, 255, 0), (0, 0, 255)
# name: (sRGB base colour, roughness, metal, emissive mask)
SLOTS = {
    # Bold r5: #6f7a85, lighter than the textile, so the cannon reads against grass (luma 53) at 2:1; graphite stays in the recesses.
    'shell': ('#6f7a85', .50, 0, (0, 0, 0)),
    'panel': ('#2c3035', .70, 0, (0, 0, 0)),
    'steel': ('#c2bab2', .35, 1, (0, 0, 0)),
    # Stylised copper: the physical F0 #fad1c2 reflected the blue sky and read pale blue-white at chase; #d4804a keeps metal reflections
    # orange. finglow: G 128 marks the fins apart from the strips (G 255), so they glow only when hot.
    'copper': ('#d4804a', .40, 1, (0, 0, 0)),
    'green': ('#2f8f5a', .50, 0, (0, 0, 0)),
    'bore': ('#0b0d10', .90, 0, (0, 0, 0)),
    'lens': ('#0b0d10', .60, 0, R),
    'strip': ('#2c3035', .55, 0, G),
    'finglow': ('#d4804a', .40, 1, (0, 128, 0)),
    'lip': ('#c2bab2', .35, 1, B),
    'inner': ('#2c3035', .70, 0, (0, 0, 0)),
    'coil': ('#1d2226', .60, 0, B),   # dark glass bands on the barrel lit by the ring glow (mask B): they read side-on
}
NAMES = list(SLOTS)
METAL = {k for k, v in SLOTS.items() if v[2] > 0}


def slot(name):
    return NAMES.index(name)


def uv_of(index):
    """Blender UV (origin bottom-left) of the first texel centre of the part's 2x2 block; glTF flips v on export."""
    bx, by = index % (SIZE//2), index//(SIZE//2)
    x, y = 2*bx + .5, 2*by + .5          # y counted from the PNG's top row
    return x/SIZE, 1 - y/SIZE


def png(path, rows):
    """Write 8-bit RGB rows (lists of (r, g, b), or an (h, w, 3) uint8 array) as a PNG with fixed zlib settings."""
    h, w = len(rows), len(rows[0])
    raw = b''.join(b'\x00' + (row.tobytes() if hasattr(row, 'tobytes') else bytes(c for px in row for c in px)) for row in rows)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    Path(path).write_bytes(data)


def _hex(c):
    return tuple(int(c[i:i+2], 16) for i in (1, 3, 5))


def maps():
    """Pixel rows for base colour, metal-roughness (G roughness, B metal) and the emissive mask."""
    out = {'base': [], 'mr': [], 'emit': []}
    for y in range(SIZE):
        rows = {k: [] for k in out}
        for x in range(SIZE):
            i = (y//2)*(SIZE//2) + x//2
            colour, rough, metal, mask = SLOTS[NAMES[i] if i < len(NAMES) else 'shell']
            rows['base'].append(_hex(colour))
            rows['mr'].append((0, round(rough*255), round(metal*255)))
            rows['emit'].append(mask)
        for k in out:
            out[k].append(rows[k])
    return out


def write(folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    paths = {}
    for k, rows in maps().items():
        paths[k] = folder/f'cannon_{k}.png'
        png(paths[k], rows)
    return paths


def material(paths):
    """One Principled material: base colour, G roughness / B metal, emissive mask (strength 1, IOR 1.5 so no extensions)."""
    import bpy
    m = bpy.data.materials.new('cannon')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']

    def tex(key, space):
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = bpy.data.images.load(str(paths[key]))
        node.image.colorspace_settings.name = space
        node.interpolation = 'Closest'
        return node
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(tex('base', 'sRGB').outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex('mr', 'Non-Color').outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    nt.links.new(tex('emit', 'Non-Color').outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1
    bsdf.inputs['IOR'].default_value = 1.5
    return m


def piece_mesh(pc, flip=False):
    import bmesh
    import bpy
    tb = lambda v: (float(v[0]), float(-v[2]), float(v[1]))
    me = bpy.data.meshes.new('piece')
    me.from_pydata([tb(v) for v in pc.v], [], pc.f)
    bm = bmesh.new()
    bm.from_mesh(me)
    bev = bm.faces.layers.int.new('bev')
    for f, part, b in zip(bm.faces, pc.p, pc.b):
        f.material_index, f[bev] = part, b
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if flip:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    if pc.bevel:
        edges = [e for e in bm.edges if len(e.link_faces) == 2 and all(f[bev] for f in e.link_faces)
                 and e.calc_face_angle(0) > radians(30)]
        bmesh.ops.bevel(bm, geom=edges, offset=pc.bevel[0], segments=pc.bevel[1], profile=.5, affect='EDGES',
                        clamp_overlap=True, material=-1)
    bm.to_mesh(me)
    bm.free()
    return me


def node_mesh(name, pieces, flips=()):
    """Join pieces (Blender axes b = (x, -z, y)) and give every face the UV of its palette slot; one material slot."""
    import bmesh
    import bpy
    bm = bmesh.new()
    for i, pc in enumerate(pieces):
        me = piece_mesh(pc, i in flips)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        f.smooth = True
        u = uv_of(f.material_index)
        for loop in f.loops:
            loop[uv].uv = u
        f.material_index = 0
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.attributes.remove(me.attributes['bev'])
    me.use_auto_smooth = True
    me.auto_smooth_angle = radians(30)
    return me
