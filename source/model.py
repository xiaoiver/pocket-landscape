"""Build the editable terrarium with Blender. Arguments after --: texture folder, output folder."""
import bpy, math, random, sys, json, struct
from pathlib import Path
from math import sin, cos, pi, exp
from mathutils import Vector
texdir,out=map(Path, sys.argv[sys.argv.index('--')+1:])
out.mkdir(exist_ok=True,parents=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
rng=random.Random(17); R=rng.uniform; tau=2*pi
def linear(n):
    s=int(n,16)/255
    return s/12.92 if s<.04045 else ((s+.055)/1.055)**2.4
def mat(name,color,rough=.83,texture=None):
    m=bpy.data.materials.new(name); m.use_nodes=True; m.use_backface_culling=False
    shader=m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*[linear(color[i:i+2]) for i in (0,2,4)],1)
    shader.inputs['Roughness'].default_value=rough
    if texture:
        node=m.node_tree.nodes.new('ShaderNodeTexImage'); node.image=bpy.data.images.load(str(texdir/texture)); node.image.pack()
        m.node_tree.links.new(node.outputs['Color'],shader.inputs['Base Color'])
    return m
class Batch:
    def __init__(self,name,m):
        self.name=name; self.mat=m; self.v=[]; self.f=[]; self.uv=[]
    def add(self,vs,fs,uv=None):
        i=len(self.v); self.v.extend(vs); self.f.extend([tuple(i+a for a in f) for f in fs])
        if uv is not None:self.uv.extend(uv)
    def finish(self):
        if not self.v:return
        me=bpy.data.meshes.new(self.name); me.from_pydata(self.v,[],self.f); me.update()
        ob=bpy.data.objects.new(self.name,me); bpy.context.collection.objects.link(ob); me.materials.append(self.mat)
        for face in me.polygons: face.use_smooth=True
        if self.uv:
            layer=me.uv_layers.new(name='Surface')
            layer.data.foreach_set('uv',[c for loop in me.loops for c in self.uv[loop.vertex_index]])
groups=[]
def group(name,color,rough=.83,texture=None):
    g=Batch(name,mat(name,color,rough,texture)); groups.append(g); return g
def grid(h,w):
    return [(i*w+j,i*w+j+1,(i+1)*w+j+1,(i+1)*w+j) for i in range(h-1) for j in range(w-1)]
def blob(g,center,sc,n=12,k=7,angle=0,jitter=0):
    v=[]; f=[]
    for j in range(k+1):
        b=-pi/2+pi*j/k
        for i in range(n):
            a=tau*i/n; t=1+R(-jitter,jitter); x=sc[0]*cos(b)*cos(a)*t;y=sc[1]*cos(b)*sin(a)*t
            v.append((center[0]+x*cos(angle)-y*sin(angle),center[1]+x*sin(angle)+y*cos(angle),center[2]+sc[2]*sin(b)*t))
    for j in range(k):
        for i in range(n):
            q=j*n+i; p=j*n+(i+1)%n;f.append((q,p,p+n,q+n))
    g.add(v,f)
def rod(g,p,q,r,end=None):
    p,q=Vector(p),Vector(q); t=(q-p).normalized()
    u=t.cross(Vector((0,0,1)) if abs(t.z)<.95 else Vector((1,0,0))).normalized(); v=t.cross(u)
    vs=[o+(u*cos(i*tau/6)+v*sin(i*tau/6))*s for o,s in [(p,r),(q,end if end is not None else r)] for i in range(6)]
    g.add(vs,[(i,(i+1)%6,6+(i+1)%6,6+i) for i in range(6)])
def path(y):return .08+.40*sin((y+.45)*2.8)
def land(x,y):
    return .60+.14*(y+1)+.13*exp(-((x+.65)**2+(y-.07)**2)*4)+.075*sin(3*x+y)*cos(4*y)
soil=group('Earth · planted bank','ffffff',.97,'earth.jpg')
# The substrate side is UV-unwrapped cylindrically; the top uses a planar mapping.
N=120; rmax=1.32
vs=[];uv=[]
for j in range(4):
    for i in range(N+1):
        a=tau*i/N;x=rmax*cos(a);y=rmax*sin(a);h=[.082,.13,.34,land(x,y)][j]; rad=[.977,.998,1,1][j]
        vs.append((x*rad,y*rad,h));uv.append((7*i/N,h*1.7))
soil.add(vs,grid(4,N+1),uv)
vs=[];uv=[]
for j in range(28):
    for i in range(N+1):
        a=tau*i/N;r=max(.0001,j/27)*rmax;x=r*cos(a);y=r*sin(a)
        vs.append((x,y,land(x,y)));uv.append((x*1.4,y*1.4))
soil.add(vs,[tuple(reversed(f)) for f in grid(28,N+1)],uv)
# Advance the original scatter's RNG stream to preserve the authored planting.
for i in range(1800):
    y=R(-1.32,1.18);w=.175+.045*(-y);x=path(y)+R(-w,w)
    if x*x+y*y>1.301**2:continue
    rng.random()       # original radius
    rng.randrange(7)   # original material choice
    # Elevation, aspect, spin, then the 7 × 5 vertex offsets.
    for _ in range(3 + 7*5):
        rng.random()
moss=[group('Cushion moss '+str(i),c) for i,c in enumerate(['617236','73823b','526632','819048','6b833d'])]
shoot=[group('Moss tips '+str(i),c) for i,c in enumerate(['839848','9ca94f','758b3f','a5af5b','627c36'])]
cushions=[]
for i in range(720):
    a=R(0,tau);r=1.29*R(0,1)**.5;x=r*cos(a);y=r*sin(a)
    if abs(x-path(y))<.235:continue
    s=min(R(.055,.18),1.321-r+.015,abs(x-path(y))-.15)
    if s<.035:continue
    h=s*R(.50,.8); z=land(x,y)-.015
    blob(rng.choice(moss),(x,y,z),(s,s*.94,h),9,5,jitter=.10)
    cushions.append((x,y,s,h,z))
# Scatter photographed moss sprigs over the domed cushion surfaces.
# Poly Haven Moss 01, Rob Tuytel (CC0). Source positions are glTF Y-up.
folder=Path(__file__).parent/'assets'/'moss'
doc=json.loads((folder/'moss_01_1k.gltf').read_text()); buf=(folder/'moss_01.bin').read_bytes()
def accessor(index,fmt):
    acc=doc['accessors'][index]; view=doc['bufferViews'][acc['bufferView']]
    start=view.get('byteOffset',0)+acc.get('byteOffset',0);size=struct.calcsize('<'+fmt)
    return [struct.unpack_from('<'+fmt,buf,start+j*view.get('byteStride',size)) for j in range(acc['count'])]
sprigs=[]
for mesh in doc['meshes']:
    prim=mesh['primitives'][0];attrs=prim['attributes']
    pos=accessor(attrs['POSITION'],'fff');uv=accessor(attrs['TEXCOORD_0'],'ff')
    ids=[i[0] for i in accessor(prim['indices'],'H')]
    sprigs.append((pos,[(u,1-v) for u,v in uv],list(zip(ids[::3],ids[1::3],ids[2::3]))))
sprout=group('Living moss · scanned sprigs','ffffff',.91,'moss.png')
nodes=sprout.mat.node_tree.nodes
sprout.mat.node_tree.links.new(next(n for n in nodes if n.type=='TEX_IMAGE').outputs['Alpha'],nodes.get('Principled BSDF').inputs['Alpha'])
sprout.mat.alpha_threshold=.42
# An explicit cutoff translates to glTF MASK.
alpha=nodes.new('ShaderNodeMath');alpha.operation='GREATER_THAN';alpha.inputs[1].default_value=.42
sprout.mat.node_tree.links.new(next(n for n in nodes if n.type=='TEX_IMAGE').outputs['Alpha'],alpha.inputs[0])
sprout.mat.node_tree.links.new(alpha.outputs[0],nodes.get('Principled BSDF').inputs['Alpha'])
for j in range(9000):
    a=R(0,tau);r=1.305*R(0,1)**.5;x=r*cos(a);y=r*sin(a)
    if abs(x-path(y))<.18+R(-.035,.045):continue
    z=land(x,y)
    for cx,cy,s,h,cz in cushions:
        d=((cx-x)/s)**2+((cy-y)/(.94*s))**2
        if d<1:z=max(z,cz+h*(1-d)**.5)
    vs,uv,faces=rng.choice(sprigs);scale=R(1.25,2.45);spin=R(0,tau);c=cos(spin)*scale;sn=sin(spin)*scale
    sprout.add([(x+vx*c+vz*sn,y+vx*sn-vz*c,z+vy*scale-.012) for vx,vy,vz in vs],faces,uv)
# Preserve the planting sequence after replacing the six original rock blobs.
# Each used one spin and 9 vertices on each of 6 latitude rings.
for _ in range(6 * (1 + 9*6)):
    rng.random()
stems=group('Petioles','708147')
rose=group('Fittonia · rose','ffffff',.65,'rose.jpg'); ivory=group('Fittonia · ivory','ffffff',.65,'ivory.jpg')
def leaf(g,base,angle,length,width,rise,arch,roll):
    f=Vector((cos(angle),sin(angle),0));side=Vector((-f.y,f.x,0));v=[];uv=[]
    for j in range(15):
        t=j/14;w=width*max(.006,sin(pi*t**.83))**.83
        for k in range(9):
            u=k/4-1
            p=Vector(base)+f*length*t+side*w*u
            p.z+=rise*t+arch*sin(pi*t)+w*(roll*u+.17*abs(u)**1.6+.045*sin(t*pi*9)*u*u)
            v.append(p);uv.append((k/8,t))
    g.add(v,[tuple(reversed(face)) for face in grid(15,9)],uv)
oldRose=group('Original foreground · leaves','ffffff',.65,'rose.jpg')
oldStems=group('Original foreground · stems','708147')
for x,y,h,rot,col in [(-.77,-.03,.50,.4,rose),(-.91,.23,.58,1.2,rose),(-.58,.34,.68,.8,rose),(.66,.21,.47,.2,ivory),(.75,.46,.57,1,ivory),(.38,.47,.42,.6,rose)]:
    petiole=oldStems if x<0 else stems
    if x<0:col=oldRose
    z=land(x,y);root=Vector((x,y,z)); lean=Vector((R(-.09,.09),R(-.08,.11),h));rod(petiole,root,root+lean,.014,.007)
    for level in range(4):
        for pair in range(2):
            a=rot+level*1.54+pair*pi+R(-.12,.12);p=root+lean*(.24+level*.25)
            attach=p+Vector((.065*cos(a),.065*sin(a),.035));rod(petiole,p,attach,.008,.004)
            l=R(.26,.43)*(1-level*.055)
            leaf(col,attach,a,l,l*R(.32,.44),R(-.08,.13)+.036*level,.056,R(-.78,.78))
fernStem=group('Original fern · ribs','708147')
fern=[group('Fern pinnae '+str(i),c,.68,'fern.jpg') for i,c in enumerate(['548237','6c993e','426f34','79a24a','618b41','8cae52'])]
for x,y,h,spread,num in [(-.48,.53,1.49,.71,10),(.42,.68,1.22,.55,9),(-.95,-.44,.34,.32,6)]:
    z=land(x,y)
    for k in range(num):
        a=k*tau/num+R(-.22,.22); d=Vector((cos(a),sin(a),0)); side=Vector((-d.y,d.x,0));up=Vector((0,0,1))
        b=Vector((x,y,z));reach=spread*R(.5,1.22);height=h*R(.7,1.17); col=rng.choice(fern)
        def spine(t):return b+d*reach*(t**1.42)+up*height*(1.68*t-.68*t*t)
        prev=b
        for j in range(1,20):
            t=j/19;mid=spine(t);rod(fernStem,prev,mid,.009*(1-t)+.0025);prev=mid
            if j<4:continue
            for sign in [-1,1]:
                length=(.012+.19*sin(pi*((t-.13)/.87))**.82)*h*.95*R(.90,1.07)
                axis=side*sign+d*.26+up*(.35+.30*t);cross=(d*.68+up*.64)
                vv=[]
                for row in range(12):
                    v=row/11;w=length*.168*max(.003,sin(pi*v**.8))**.75*(.78 if row%2 else 1.10)
                    pos=mid+axis*length*v+up*length*.19*sin(v*pi)
                    vv.extend([pos-cross*w,pos+up*.008*sin(pi*v),pos+cross*w])
                col.add(vv,grid(12,3),[(i%3/2,(i//3)/11) for i in range(36)])
strap=[group('Canopy '+str(i),c,.48,'canopy.jpg') for i,c in enumerate(['608641','779b4f','527a3d','8da857'])]
for j in range(12):
    a=j*2.4;l=R(.45,.95);leaf(rng.choice(strap),(-.05,.75,land(-.05,.75)),a,l,R(.065,.12),R(.81,1.48),.38,R(-.85,.85))
for g in groups:
    # The old scatter still seeds the subsequent hand-tuned planting layout.
    if not g.name.startswith(('Cushion moss','Living moss')):
        g.finish()
from runpy import run_path
floor=run_path(str(Path(__file__).with_name('terrarium-floor.py')))
floor['install']()
floor['lower_path_leaves'](bpy.data.objects['Fittonia · ivory'])
run_path(str(Path(__file__).with_name('scenery-rocks.py')))['install'](land,floor['bed'])
gravel = run_path(str(Path(__file__).with_name('path-gravel.py')))['install'](land)
floor['dress_path_edge'](bpy.data.objects['Living moss · rosettes'], gravel)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'woodland.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'woodland.glb'),export_format='GLB',export_yup=True,export_animations=False)
