"""Studio return panel; only opens a task, never renders or edits it silently."""
import bpy,re,webbrowser
class REVELATION_OT_edit_task(bpy.types.Operator):
 bl_idname='revelation.edit_task';bl_label='Modifier la tâche dans le Studio'
 def execute(self,context):
  jid=context.scene.get('revelation_job_id','')
  if not re.fullmatch('[a-f0-9]{12}',jid):self.report({'WARNING'},'Cette scène ne possède pas de tâche Révélation liée.');return {'CANCELLED'}
  webbrowser.open('revelationstudio://edit?job='+jid);return {'FINISHED'}
class REVELATION_PT_return(bpy.types.Panel):
 bl_label='Révélation Studio';bl_idname='REVELATION_PT_return';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='Révélation'
 def draw(self,context):
  self.layout.label(text='Tâche : '+context.scene.get('revelation_job_id','aucune'))
  self.layout.operator('revelation.edit_task')
def register():
 for cls in (REVELATION_OT_edit_task,REVELATION_PT_return):
  if not hasattr(bpy.types,cls.__name__):bpy.utils.register_class(cls)
def unregister():
 for cls in (REVELATION_PT_return,REVELATION_OT_edit_task):
  if hasattr(bpy.types,cls.__name__):bpy.utils.unregister_class(cls)
register()
