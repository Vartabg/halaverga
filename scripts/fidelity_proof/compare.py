"""Blender-only comparison assembly; preserve renders without image enhancement."""
import argparse
import bpy
import numpy as np
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from common import ROOT, DOC, REF

parser=argparse.ArgumentParser(); parser.add_argument('--revision',type=int,required=True)
parser.add_argument('--stage',choices=['groin-fix'])
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
output=DOC/(args.stage or 'pass-'+str(args.revision))


def read(path):
    image=bpy.data.images.load(str(path),check_existing=False)
    w,h=image.size; pixels=np.empty(w*h*4,dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(h,w,4)


def save(name,pixels):
    h,w,_=pixels.shape
    image=bpy.data.images.new(name,width=w,height=h,alpha=True)
    image.pixels.foreach_set(pixels.ravel())
    image.file_format='PNG'; image.filepath_raw=str(output/name); image.save()


def on_gray(pixels):
    result=np.ones_like(pixels); alpha=pixels[:,:,3:4]
    result[:,:,:3]=pixels[:,:,:3]*alpha+.83*(1-alpha)
    return result


reference=read(ROOT/REF['image']); pairs=[]; overlays=[]
for view in ['front','profile','back']:
    x0,y0,x1,y1=REF['views'][view]['crop']
    crop=reference[reference.shape[0]-y1:reference.shape[0]-y0,x0:x1,:].copy()
    actual=read(output/(view+'.png'))
    assert crop.shape==actual.shape, 'Reference/render registration dimensions differ.'
    gap=np.ones((crop.shape[0],16,4),dtype=np.float32)*.83; gap[:,:,3]=1
    pair=np.concatenate([crop,gap,on_gray(actual)],axis=1)
    save('compare-'+view+'.png',pair); pairs.append(pair)
    silhouette=np.ones_like(actual)
    silhouette[:,:,:3]=[.03,.42,.72]; silhouette[:,:,3]=actual[:,:,3]*.35
    save('silhouette-'+view+'.png',silhouette)
    a=silhouette[:,:,3:4]
    overlay=crop.copy(); overlay[:,:,:3]=silhouette[:,:,:3]*a+crop[:,:,:3]*(1-a)
    save('overlay-'+view+'.png',overlay); overlays.append(overlay)
save('full-body-comparison.png',np.concatenate(pairs,axis=1))
save('silhouette-overlays.png',np.concatenate(overlays,axis=1))
busts=[on_gray(read(output/(name+'.png'))) for name in ['bust-front','bust-profile','bust-three-quarter']]
save('bust-views.png',np.concatenate(busts,axis=1))
# Show the original head close-up without generating another interpretation.
# This panel is deliberately not presented as an orthographic scale overlay.
closeup=reference[1024-830:1024-90,1100:1536,:]
board=np.ones((1100,436,4),dtype=np.float32)*.83; board[:,:,3]=1
board[180:920,:,:]=closeup
save('head-concept-comparison.png',np.concatenate([board,busts[2]],axis=1))
print('[Proof] Comparisons → unaltered clay renders, registered reference pairs and transparent silhouettes.')
