"""Append sampled clips to an exported GLB as glTF animations (rotation channels per bone, translation on the pelvis).

Blender's exporter is left out of the animation path on purpose: the samples are already local rotations in three.js axes for
identity-rest nodes, so writing them directly cannot pick up an exporter axis or bone-roll correction.
"""
import json
import struct


def _read(path):
    data = open(path, 'rb').read()
    length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20+length])
    bin_len = struct.unpack_from('<I', data, 20+length)[0]
    binary = bytearray(data[28+length:28+length+bin_len])
    return gltf, binary


def _write(path, gltf, binary):
    while len(binary) % 4:
        binary.append(0)
    gltf['buffers'][0]['byteLength'] = len(binary)
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' '*((4-len(text) % 4) % 4)
    total = 12+8+len(text)+8+len(binary)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(text), 0x4E4F534A)+text)
        f.write(struct.pack('<II', len(binary), 0x004E4942)+bytes(binary))


def _accessor(gltf, binary, values, kind, width, bounds=False):
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    flat = [v for row in values for v in row] if width > 1 else list(values)
    binary.extend(struct.pack(f'<{len(flat)}f', *flat))
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': 4*len(flat)})
    acc = {'bufferView': len(gltf['bufferViews'])-1, 'componentType': 5126, 'count': len(values), 'type': kind}
    if bounds:
        acc['min'], acc['max'] = [min(flat)], [max(flat)]
    gltf['accessors'].append(acc)
    return len(gltf['accessors'])-1


def embed(path, clips, bones):
    """clips: {name: retarget.sample result}; bones: game bone names in sample order."""
    gltf, binary = _read(path)
    nodes = {n.get('name'): i for i, n in enumerate(gltf['nodes'])}
    missing = [b for b in bones if b not in nodes]
    if missing:
        raise SystemExit(f'GLB lacks bones {missing}')
    gltf.setdefault('animations', [])
    for name, clip in clips.items():
        times = _accessor(gltf, binary, clip['times'], 'SCALAR', 1, True)
        samplers, channels = [], []
        for i, bone in enumerate(bones):
            out = _accessor(gltf, binary, [frame[i] for frame in clip['rotations']], 'VEC4', 4)
            samplers.append({'input': times, 'output': out, 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers)-1, 'target': {'node': nodes[bone], 'path': 'rotation'}})
        rest = gltf['nodes'][nodes['pelvis']].get('translation', [0, 0, 0])
        out = _accessor(gltf, binary, [[a+b for a, b in zip(p, rest)] for p in clip['pelvis']], 'VEC3', 3)
        samplers.append({'input': times, 'output': out, 'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers)-1, 'target': {'node': nodes['pelvis'], 'path': 'translation'}})
        gltf['animations'].append({'name': name, 'samplers': samplers, 'channels': channels})
    _write(path, gltf, binary)
