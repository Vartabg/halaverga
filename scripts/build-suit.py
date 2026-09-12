"""Original Meridian reconnaissance suit. Run with Blender --background --python."""
import bpy
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from suit_mesh import material, loft, panel, seam, visor

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
material('textile', (.024,.040,.049), .82)
material('ceramic', (.52,.60,.60), .32)
material('titanium', (.14,.20,.22), .38, .35)
material('visor', (.012,.045,.058), .13, .48)
material('copper', (.42,.23,.12), .3, .7)
material('energy', (.025,.65,.49), .3, .1, 2.0)

# Underlayer follows the body; plates only cover the load-bearing areas.
loft('Pressure weave', [(-.27,.155,.085),(-.19,.188,.108),(-.09,.168,.10),
    (.03,.145,.088),(.16,.165,.099),(.30,.217,.126),(.43,.246,.125),
    (.52,.215,.103),(.575,.10,.081)], 'textile')
loft('Collar seal',[(.535,.106,.09),(.585,.105,.09),(.62,.086,.076)],'titanium')
loft('Helmet shell',[(.63,.067,.063),(.659,.105,.104),(.705,.13,.126),
    (.78,.14,.143),(.851,.137,.141),(.916,.105,.115),(.953,.058,.067),
    (.965,.008,.012)],'ceramic',1,segments=28)
visor()
panel('Helmet crown', [(-.027,-.133,.845),(-.021,-.082,.94),(.021,-.082,.94),
    (.027,-.133,.845),(.029,-.146,.72),(-.029,-.146,.72)],'titanium',1)
seam('Helmet rear status',[(0,-.145,.85),(0,-.156,.79),(0,-.145,.733)],'energy',1,.003)

for side in [-1,1]:
    def plate(name, coords, finish='ceramic', rig=0):
        return panel(name, [(side*x,y,z) for x,y,z in coords], finish, rig)
    # Separate chest and scapular panels taper into the waist; no external backpack.
    plate('Pectoral shell',[(.017,.124,.48),(.155,.13,.49),(.232,.082,.405),
        (.192,.113,.255),(.054,.126,.21),(.02,.14,.31)])
    plate('Floating rib',[(.176,.10,.24),(.145,.104,.10),(.073,.106,.05),
        (.052,.116,.17)],'titanium')
    plate('Scapula shell',[(.033,-.122,.502),(.157,-.115,.504),(.23,-.085,.423),
        (.185,-.119,.27),(.098,-.119,.195),(.035,-.137,.31)])
    plate('Rear flank',[(.159,-.09,.20),(.137,-.1,.07),(.074,-.097,.015),
        (.051,-.111,.145)],'titanium')
    seam('Scapula inlay',[(side*.055,-.14,.452),(side*.10,-.143,.37),
        (side*.16,-.125,.33)],'copper',radius=.004)
    seam('Thorax signal',[(side*.047,.149,.43),(side*.082,.144,.32)],'energy',radius=.003)
    plate('Iliac shell',[(.031,.102,-.081),(.142,.10,-.067),(.18,.087,-.15),
        (.146,.093,-.231),(.053,.103,-.191)],'titanium')
    plate('Rear hip shell',[(.034,-.106,-.08),(.144,-.10,-.066),(.176,-.09,-.15),
        (.14,-.108,-.225),(.043,-.11,-.22)],'titanium')

# Small segmented power spine sits almost flush with the body.
for i in range(6):
    z = .47-i*.071
    depth = -.145 if i<4 else -.113
    panel('Spine vertebra', [(-.028,depth,z+.027),(.028,depth,z+.027),
        (.037,depth-.006,z),(.022,depth,z-.027),(-.022,depth,z-.027),
        (-.037,depth-.006,z)],'titanium')
    seam('Spine telemetry',[(0,depth-.009,z+.017),(0,depth-.009,z-.015)],'energy',radius=.004)
loft('Waist coupling',[(-.065,.161,.103),(-.039,.157,.10)],'titanium')
seam('Chest seam',[(0,.137,.49),(0,.144,.33),(0,.118,.18),(0,.099,.07)],'titanium',radius=.005)

for s in [-1,1]:
    arm = 2 if s<0 else 3
    leg = 4 if s<0 else 5
    def limb(name, rings, finish, x, rig, y=0):
        return loft(name,rings,finish,rig,s*x,y,segments=16)
    def plate(name, coords, finish, rig):
        return panel(name,[(s*x,y,z) for x,y,z in coords],finish,rig)
    # Compact shoulder cap and continuous tapered sleeves replace the block joints.
    limb('Arm pressure sleeve',[(-.27,.044,.047),(-.15,.055,.062),(-.015,.064,.073),
        (.06,.058,.06),(.19,.072,.075),(.35,.08,.084),(.465,.056,.065)],'textile',.325,arm)
    limb('Shoulder ceramic',[ (.36,.057,.076),(.43,.091,.105),(.493,.069,.084),
        (.519,.03,.046)],'ceramic',.286,arm)
    plate('Bicep front',[(.293,.079,.34),(.361,.071,.32),(.365,.066,.20),
        (.322,.079,.13),(.29,.075,.20)],'ceramic',arm)
    plate('Bicep rear',[(.29,-.082,.35),(.354,-.078,.32),(.366,-.066,.19),
        (.326,-.082,.13),(.294,-.076,.21)],'titanium',arm)
    limb('Elbow flexible cuff',[(.01,.063,.071),(.041,.067,.073),(.071,.063,.069)],'titanium',.325,arm)
    plate('Forearm carapace',[(.28,.066,-.01),(.337,.08,.009),(.379,.045,-.05),
        (.366,.039,-.225),(.304,.059,-.231),(.28,.065,-.12)],'ceramic',arm)
    plate('Forearm rear guard',[(.284,-.066,-.015),(.342,-.079,-.01),(.375,-.044,-.07),
        (.361,-.045,-.22),(.303,-.058,-.221)],'titanium',arm)
    seam('Wrist channel',[(s*.34,.083,-.045),(s*.345,.064,-.19)],'energy',arm,.003)
    limb('Hand glove',[(-.378,.031,.046),(-.35,.044,.059),(-.277,.047,.055),
        (-.253,.041,.044)],'textile',.33,arm,y=.013)
    plate('Hand dorsal shield',[(.306,-.04,-.278),(.356,-.04,-.282),(.356,-.045,-.336),
        (.312,-.045,-.344)],'ceramic',arm)
    for dz in [.0,.018,.036]:
        seam('Hand knuckle seam',[(s*.301,.062,-.313-dz),(s*.351,.062,-.313-dz)],'titanium',arm,.002)
    limb('Thigh pressure layer',[(-.615,.065,.065),(-.55,.074,.077),(-.38,.099,.103),
        (-.255,.095,.093),(-.211,.077,.078)],'textile',.119,leg)
    plate('Thigh front shell',[(.052,.087,-.264),(.147,.105,-.273),(.194,.079,-.332),
        (.169,.074,-.509),(.109,.087,-.562),(.065,.078,-.48)],'ceramic',leg)
    plate('Thigh rear tendon',[(.07,-.09,-.27),(.161,-.097,-.284),(.194,-.07,-.36),
        (.162,-.074,-.523),(.104,-.079,-.56),(.065,-.078,-.43)],'titanium',leg)
    seam('Thigh outer seam',[(s*.19,.055,-.31),(s*.197,.036,-.43),(s*.166,.042,-.52)],'copper',leg,.003)
    limb('Knee seal',[(-.643,.06,.069),(-.613,.071,.079),(-.573,.062,.068)],'textile',.119,leg)
    plate('Patella shield',[(.075,.078,-.576),(.154,.078,-.576),(.179,.071,-.615),
        (.138,.082,-.659),(.091,.084,-.64)],'ceramic',leg)
    limb('Calf weave',[(-.945,.049,.049),(-.82,.059,.065),(-.72,.077,.081),
        (-.648,.062,.067)],'textile',.119,leg)
    plate('Shin contour',[(.069,.066,-.665),(.139,.079,-.656),(.176,.058,-.716),
        (.156,.047,-.913),(.09,.052,-.942),(.07,.06,-.83)],'ceramic',leg)
    plate('Calf propulsion blade',[(.08,-.069,-.663),(.149,-.069,-.663),(.179,-.082,-.729),
        (.143,-.065,-.879),(.105,-.064,-.913),(.07,-.068,-.83)],'titanium',leg)
    seam('Calf propulsion slit',[(s*.12,-.093,-.706),(s*.12,-.085,-.794),
        (s*.12,-.068,-.861)],'energy',leg,.005)
    limb('Boot sculpted sole',[(-1.015,.053,.111),(-.995,.068,.135),(-.969,.068,.131),
        (-.925,.051,.075),(-.885,.048,.049)],'textile',.119,leg,y=.04)
    plate('Boot instep',[(.075,.083,-.916),(.164,.083,-.916),(.166,.159,-.974),
        (.139,.177,-.985),(.087,.167,-.977)],'titanium',leg)

# Curves become ordinary triangles; the runtime needs no procedural authoring code.
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = next(iter(bpy.context.scene.objects))
bpy.ops.object.convert(target='MESH')
destination = Path(__file__).resolve().parents[1] / 'public/models/suit.glb'
bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', export_yup=True,
    export_extras=True, export_texcoords=False, export_normals=True, export_animations=False)
print('Exported fitted suit:', destination, destination.stat().st_size, 'bytes')
