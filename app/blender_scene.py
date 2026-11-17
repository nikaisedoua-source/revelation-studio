"""Generated scene body: deterministic, editable geometry and real imported GLB."""
SCENE_SCRIPT = '''import bpy, math, json
from mathutils import Vector
from pathlib import Path
s = __SPEC__
root=Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene['revelation_job_id']=s.get('job_id','')
scene.render.engine='CYCLES';scene.cycles.samples=16
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.fps=s['fps'];scene.frame_start=1;scene.frame_end=round(s['duration']*s['fps'])
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.filepath=str(root/'images'/'plan_')
scene.view_settings.view_transform='AgX'
def material(name,color,metal=0.0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.3
 return m
gold=material('Dorure du titre',(0.72,.42,.10),.65);red=material('Carrosserie rouge',(.55,.012,.018),.6);dark=material('Pneus',(.018,.02,.025));glass=material('Vitrage',(.035,.12,.18),.5)
def cube(name,location,scale,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);b=o.modifiers.new('Arêtes adoucies','BEVEL');b.width=.08;b.segments=3;o.modifiers.new('Normales','WEIGHTED_NORMAL');return o
objects=[]
if (root/'MODELE_GENERE.glb').is_file():
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(root/'MODELE_GENERE.glb'));objects=[o for o in bpy.data.objects if o not in before]
 mesh=[o for o in objects if o.type=='MESH']
 if mesh:
  corners=[o.matrix_world@Vector(v) for o in mesh for v in o.bound_box];low=Vector(tuple(min(v[i] for v in corners) for i in range(3)));high=Vector(tuple(max(v[i] for v in corners) for i in range(3)));center=(low+high)/2;factor=4/max(high-low)
  bpy.ops.object.empty_add();pivot=bpy.context.object;pivot.name='MODELE_TRIPO'
  for o in objects:
   if o.parent is None:o.parent=pivot
  pivot.scale=(factor,)*3;pivot.location=-center*factor;objects=[pivot]
elif s['kind'] in ('carton','logo'):
 curve=bpy.data.curves.new('Texte source exact','FONT');curve.body=s['title'];curve.align_x='CENTER';curve.align_y='CENTER';curve.extrude=.10;curve.bevel_depth=.012;curve.bevel_resolution=3
 o=bpy.data.objects.new('TITRE_EDITABLE',curve);scene.collection.objects.link(o);o.rotation_euler=(math.pi/2,0,0);o.data.materials.append(gold);bpy.context.view_layer.update();scale=min(1,7.5/max(o.dimensions.x,.1));o.scale=(scale,)*3;objects=[o]
elif s['kind']=='carte':
 # A stylized editable network, not a geographic reconstruction.
 pts=[(-3,0,0),(-1,-.1,1),(1,0,.2),(3,0,1.2)]
 for i,p in enumerate(pts):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.14,location=p);o=bpy.context.object;o.name='REPERE_'+str(i+1);o.data.materials.append(gold);objects.append(o)
 curve=bpy.data.curves.new('Trajet modifiable','CURVE');curve.dimensions='3D';curve.bevel_depth=.025;poly=curve.splines.new('POLY');poly.points.add(len(pts)-1)
 for point,p in zip(poly.points,pts):point.co=(*p,1)
 o=bpy.data.objects.new('TRAJET',curve);scene.collection.objects.link(o);o.data.materials.append(gold);objects.append(o)
elif any(x in s['brief'].lower() for x in ('voiture','sports car','sportscar')):
 # Procedural car mockup. This is explicitly identified as procedural in its spec.
 objects=[cube('Carrosserie', (0,0,.2),(4,1.6,.55),red),cube('Habitacle',(0,0,.7),(1.9,1.25,.7),glass),cube('Capot',(1.45,0,.52),(1.0,1.45,.15),red)]
 for x in (-1.3,1.3):
  for y in (-.78,.78):
   bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.43,depth=.22,location=(x,y,0),rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='Roue';o.data.materials.append(dark);objects.append(o)
else:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=1.5);o=bpy.context.object;o.name='OBJET_DE_COMPOSITION';o.data.materials.append(gold);objects=[o]
# Keyframes affect the generated objects only.
for o in objects:
 original=o.scale.copy();o.scale=original*.05;o.keyframe_insert(data_path='scale',frame=1);o.scale=original;o.keyframe_insert(data_path='scale',frame=min(scene.frame_end,round(.9*s['fps'])))
bpy.ops.object.camera_add(location=(6,-12,4));cam=bpy.context.object;cam.name='CAMERA_PLAN';scene.camera=cam;cam.data.lens=50
cam.rotation_euler=(Vector((0,0,.25))-cam.location).to_track_quat('-Z','Y').to_euler();cam.keyframe_insert(data_path='location',frame=1);cam.location.x=4.8;cam.keyframe_insert(data_path='location',frame=scene.frame_end)
for name,loc,power,size in [('KEY',(-4,-6,6),1800,5),('FILL',(4,-3,2),800,4),('RIM',(2,3,5),2000,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
scene.frame_set(min(scene.frame_end,s['fps']))
'''
