"""Run in Blender against the saved artifact; fail on regression or broad edits."""
import bpy
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from evidence import topology_hash

body=bpy.data.objects['Studio anatomy - reference fit']
keys=body.data.shape_keys.key_blocks
assert 'Groin - smooth fitted contour' in keys, 'The localized groin correction is missing.'
fit=keys['Reference silhouette - editable fit']; correction=keys['Groin - smooth fitted contour']
assert correction.relative_key==fit and correction.value==1
assert topology_hash(body.data)==bpy.context.scene['source_topology_sha256']
changed=[]
for index,(before,after) in enumerate(zip(fit.data,correction.data)):
    delta=after.co-before.co
    if delta.length<1e-7: continue
    changed.append(index)
    assert abs(before.co.x)<.135 and .94<before.co.y<1.17 and before.co.z>.015
    assert abs(delta.x)<1e-7 and abs(delta.y)<1e-7, 'Only local front depth may change.'
    assert 0<delta.z<.085, 'Unexpected inward or excessive displacement.'
center=[p.co.z for p in correction.data if abs(p.co.x)<.012 and 1.02<p.co.y<1.09 and p.co.z>.04]
assert center and min(center)>.12, 'The center remains recessed behind the adjacent front surface.'
assert 5<len(changed)<500, 'Correction unexpectedly empty or broad.'
assert bpy.context.scene['proof_stage']=='groin-fix'
print('[Groin] Saved correction → localized, topology preserved, center depression filled;',len(changed),'vertices.')
