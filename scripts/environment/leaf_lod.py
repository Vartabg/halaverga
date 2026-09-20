"""Preserve canopy coverage by sampling whole leaves, not shrinking their triangles."""
import bpy
import numpy as np


def canopy_lod(obj, count, enlargement):
    mesh = obj.data
    parent = list(range(len(mesh.vertices)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for edge in mesh.edges:
        a, b = edge.vertices
        parent[root(a)] = root(b)
    groups = {}
    for i in range(len(parent)):
        groups.setdefault(root(i), []).append(i)
    leaves = [g for g in groups.values() if 5 <= len(g) <= 100]
    if len(leaves) < count:
        return False
    chosen = np.random.default_rng(2113).choice(len(leaves), count, replace=False)
    uv_source = mesh.uv_layers.active.data
    uvs = {}
    for loop in mesh.loops:
        uvs[loop.vertex_index] = tuple(uv_source[loop.index].uv)
    vertices, texcoords, faces = [], [], []
    outline = [(-1, 0), (-.4, .8), (.4, .72), (1, 0), (.4, -.72), (-.4, -.8)]
    for index in chosen:
        group = leaves[index]
        points = np.array([mesh.vertices[v].co[:] for v in group])
        center = points.mean(axis=0)
        _, _, axes = np.linalg.svd(points - center, full_matrices=False)
        local = (points - center) @ axes.T
        length, width = np.max(np.abs(local[:, :2]), axis=0)
        if length < .0001 or width < .0001:
            continue
        start = len(vertices)
        for a, b in outline:
            offset = axes[0] * a * length + axes[1] * b * width
            vertices.append(tuple(center + offset * enlargement))
            nearest = int(np.argmin(np.sum((points - center - offset) ** 2, axis=1)))
            texcoords.append(uvs[group[nearest]])
        faces.extend([(start, start + i, start + i + 1) for i in range(1, 5)])
    material = mesh.materials[mesh.polygons[0].material_index]
    result = bpy.data.meshes.new(mesh.name + '_whole_leaf_lod')
    result.from_pydata(vertices, [], faces)
    result.materials.append(material)
    layer = result.uv_layers.new(name='UVMap')
    for loop in result.loops:
        layer.data[loop.index].uv = texcoords[loop.vertex_index]
    obj.data = result
    return True
