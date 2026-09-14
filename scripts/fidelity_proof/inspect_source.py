"""Read-only compatibility and provenance audit of the official asset bundle."""
import bpy
import json

for name in ['License', 'README']:
    print('[Source] Text →', name, bpy.data.texts[name].as_string())
for name in ['GEO-body_male_realistic', 'GEO-body_male_realistic.eye.L', 'GEO-body_male_realistic.eye.R']:
    obj = bpy.data.objects[name]
    print('[Source] Object →', json.dumps({
        'name': name, 'vertices': len(obj.data.vertices), 'polygons': len(obj.data.polygons),
        'location': list(obj.location), 'rotation': list(obj.rotation_euler),
        'scale': list(obj.scale), 'parent': obj.parent.name if obj.parent else None,
        'bounds': [[min(v.co[i] for v in obj.data.vertices), max(v.co[i] for v in obj.data.vertices)] for i in range(3)],
        'modifiers': [(m.name, m.type, getattr(m, 'levels', None), getattr(m, 'total_levels', None)) for m in obj.modifiers],
        'groups': [g.name for g in obj.vertex_groups],
        'shape_keys': [k.name for k in obj.data.shape_keys.key_blocks] if obj.data.shape_keys else [],
        'properties': {k: str(v)[:200] for k, v in obj.items()},
    }))
