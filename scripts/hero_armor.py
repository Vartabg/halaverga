"""Fitted panel layout traced from the generated explorer turnaround."""
from suit_mesh import panel, seam, loft


def armor():
    for s in [-1,1]:
        def plate(name, points, finish='ceramic', joint=0):
            return panel(name,[(s*x,y,z) for x,y,z in points],finish,joint,depth=.009)
        plate('Split pectoral shell',[(.018,.129,.514),(.066,.096,.568),
              (.15,.075,.557),(.203,.074,.495),(.198,.073,.406),
              (.075,.133,.363),(.019,.143,.394)])
        plate('Clavicle bridge',[(.071,.037,.623),(.172,.034,.591),
              (.201,.026,.564),(.171,.068,.546),(.065,.081,.582)])
        for back in [1,-1]:
            plate('Shoulder shell',[(.216,back*.049,.603),(.267,back*.04,.588),
                  (.307,back*.049,.552),(.326,back*.04,.478),
                  (.288,back*.087,.488),(.239,back*.081,.558)],joint=2 if s<0 else 3)
        plate('Oblique support',[(.195,.073,.388),(.22,.034,.402),
              (.166,.067,.207),(.14,.104,.139),(.147,.112,.254)],'visor')
        plate('Hip fin',[(.133,.082,.151),(.169,.039,.125),(.18,.045,.05),
              (.107,.096,.056),(.106,.115,.09)])
        plate('Biceps outer plate',[(.288,.061,.429),(.319,.034,.401),
              (.338,.029,.294),(.306,.061,.276),(.277,.063,.323)],joint=2 if s<0 else 3)
        plate('Forearm gauntlet',[(.281,.047,.133),(.314,.061,.158),
              (.35,.04,.091),(.352,.031,-.035),(.327,.047,-.064),
              (.296,.034,-.024)],joint=6 if s<0 else 7)
        plate('Glove back',[(.30,-.024,-.088),(.346,-.024,-.097),
              (.357,-.018,-.145),(.308,-.025,-.151)],'visor',6 if s<0 else 7)
        plate('Thigh shell',[(.123,.107,-.052),(.183,.065,-.126),
              (.188,.051,-.304),(.151,.075,-.413),(.101,.094,-.376),
              (.086,.106,-.187)],joint=4 if s<0 else 5)
        plate('Knee cap',[(.089,.064,-.461),(.139,.065,-.457),
              (.165,.052,-.509),(.14,.068,-.56),(.102,.071,-.557),
              (.079,.061,-.514)],joint=8 if s<0 else 9)
        plate('Shin guard',[(.1,.064,-.589),(.155,.051,-.595),
              (.155,.04,-.724),(.136,.047,-.873),(.099,.057,-.899),
              (.078,.059,-.781),(.075,.061,-.645)],joint=8 if s<0 else 9)
        plate('Boot upper',[(.066,.071,-.904),(.157,.072,-.904),
              (.155,.146,-.937),(.135,.184,-.949),(.078,.183,-.949),
              (.063,.13,-.928)],joint=8 if s<0 else 9)
        # Back has a clearly different arrangement from the pectoral shells.
        plate('Scapula rail',[(.069,-.085,.587),(.173,-.068,.554),
              (.206,-.071,.475),(.155,-.113,.366),(.09,-.129,.375)])
        plate('Lower back rail',[(.075,-.125,.335),(.145,-.107,.339),
              (.138,-.104,.208),(.098,-.102,.154),(.06,-.111,.193)],'visor')
        seam('Chest copper edge',[(s*.191,.09,.421),(s*.115,.132,.377),(s*.075,.144,.369)],'copper',radius=.002)
        seam('Side tailoring',[(s*.14,.073,.337),(s*.11,.094,.27),(s*.105,.098,.164)],'copper',radius=.0018)
        seam('Thigh copper edge',[(s*.184,.073,-.145),(s*.182,.066,-.302),(s*.15,.088,-.404)],'copper',4 if s<0 else 5,.002)
        seam('Gauntlet light',[(s*.325,.077,.102),(s*.329,.074,.045)],'energy',6 if s<0 else 7,.0023)
        seam('Calf light',[(s*.139,-.083,-.7),(s*.139,-.071,-.77)],'energy',8 if s<0 else 9,.002)
        for z in [-.94,-.963]:
            seam('Boot strap',[(s*.064,.03,z),(s*.067,.139,z),(s*.111,.192,z),
                 (s*.154,.139,z),(s*.156,.03,z)],'visor',8 if s<0 else 9,.004)
        for z in [.195,.207,.219]:
            seam('Elbow flex rib',[(s*.267,.024,z),(s*.299,.05,z),(s*.333,.02,z)],'visor',6 if s<0 else 7,.002)
    loft('High suit collar',[(.625,.071,.072),(.635,.074,.074),
         (.677,.068,.071),(.701,.063,.067)],'visor')
    for z,width in [(.519,.052),(.408,.043),(.29,.034)]:
        panel('Flush spinal flight module',[(-width,-.117,z+.041),(0,-.131,z+.062),
              (width,-.117,z+.041),(width*.73,-.135,z-.058),
              (0,-.142,z-.071),(-width*.73,-.135,z-.058)],'visor',depth=.012)
        seam('Spinal navigation light',[(0,-.159,z+.026),(0,-.16,z-.039)],'energy',radius=.003)
    for z in [.5,.441,.389]:
        seam('Sternum light',[(0,.149,z+.017),(0,.154,z-.014)],'energy',radius=.0023)
