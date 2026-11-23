"""Paint tileable soil and two branching leaf-vein maps for the garden."""
from PIL import Image, ImageDraw, ImageFilter
from math import sin, pi
import random, pathlib, sys
out=pathlib.Path(sys.argv[1]); out.mkdir(exist_ok=True,parents=True)
rng=random.Random(48)
for label,base,vein in [('rose',(48,81,44),(227,132,140)),('ivory',(57,92,48),(190,193,139))]:
    n=512
    img=Image.new('RGB',(n,n)); p=img.load()
    for y in range(n):
        for x in range(n):
            v=1-y/n; u=abs(2*x/n-1)
            d=4*sin(v*21+u*8)+2*sin(v*65+u*11)+rng.gauss(0,2.6)+4*(1-u)
            p[x,y]=tuple(round(c+d) for c in base)
    draw=ImageDraw.Draw(img)
    def line(points,color,width): draw.line(points,fill=color,width=width,joint='curve')
    for sign in [-1,1]:
        for i in range(9):
            root=.07+i*.094+rng.uniform(-.012,.012)
            span=min(.22,(1-root)*.72)
            def at(t):
                return (n/2+sign*t*n*.49,n*(1-root-span*(t**1.55+.20*sin(t*pi))))
            pts=[at(j/32) for j in range(33)]
            for j in range(3,28,4):
                x,y=pts[j]
                t=j/32
                pts2=[(x+sign*k*(1-t)*2.5,y-k*(1+.07*k)) for k in range(15)]
                line(pts2,tuple(int(.48*a+.52*b) for a,b in zip(base,vein)),2)
            line(pts,tuple(int(.22*a+.78*b) for a,b in zip(base,vein)),5)
    for j in range(n):
        w=1+int(3*j/n); x=n//2
        draw.line((x-w,j,x+w,j),fill=vein)
    img.save(out/(label+'.jpg'),quality=89)
img=Image.new('RGB',(640,640)); p=img.load()
for y in range(640):
    for x in range(640):
        b=rng.gauss(0,7)+3*sin(2*pi*x/640*8+sin(2*pi*y/640*10))
        p[x,y]=(int(65+b),int(47+b*.75),int(34+b*.6))
d=ImageDraw.Draw(img)
for i in range(23000):
    x,y=rng.randrange(640),rng.randrange(640); r=rng.choices([1,2,3,4],[6,4,2,1])[0]
    c=rng.choice([(36,27,22),(81,58,43),(111,81,52),(51,38,28),(102,82,62)])
    d.polygon([(x-r,y),(x,y-r),(x+r*1.5,y-r*.3),(x+r,y+r*.7)],fill=c)
for i in range(125):
    x,y=rng.randrange(640),rng.randrange(640)
    d.line([(x,y),(x+3,y+3),(x+8,y+4),(x+12,y+7)],(109,83,52))
img.save(out/'earth.jpg',quality=90)
# Fern and stone microtexture; the UV runs along each individual pinna.
img=Image.new('RGB',(192,320)); p=img.load()
for y in range(img.height):
    for x in range(img.width):
        u=abs((x-96)/96);v=y/320
        vein=max(0,1-abs(((v+.095*u**1.4)*12)%1-.5)*22)
        k=1+.10*sin(v*13+u*2)+.05*sin(u*32+7*v)+.18*vein+.26*(1-min(1,u*30))
        p[x,y]=tuple(min(255,round(c*k+rng.gauss(0,3))) for c in (127,151,88))
img.save(out/'fern.jpg',quality=92)
img=Image.new('RGB',(384,384));p=img.load()
for y in range(384):
    for x in range(384):
        m=4*sin((x+y)*.09)+7*sin(x*.025+sin(y*.044)*3)+2*sin(y*.9)+rng.gauss(0,10)
        p[x,y]=tuple(round(c+m) for c in (128,126,109))
img.save(out/'granite.jpg',quality=88)
moss=pathlib.Path(__file__).parent/'assets'/'moss'/'textures'
img=Image.open(moss/'moss_01_diff_1k.jpg').convert('RGBA');img.putalpha(Image.open(moss/'moss_01_alpha_1k.png').convert('L'));img.save(out/'moss.png')
# Fine parallel venation and a pale midrib for the long canopy leaves.
img=Image.new('RGB',(192,320));p=img.load()
for y in range(320):
    for x in range(192):
        u=(x-95.5)/96;v=y/320
        light=5*sin(abs(u)*44+sin(v*6))+4*sin(u*13)+13*(1-abs(u))+.9*rng.gauss(0,1.8)
        if abs(u)<.022:light+=30
        p[x,y]=tuple(round(c+light) for c in (70,106,52))
img.save(out/'canopy.jpg',quality=90)
