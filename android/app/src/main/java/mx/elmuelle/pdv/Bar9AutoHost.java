package mx.elmuelle.pdv;

import android.app.PendingIntent;
import android.content.*;
import android.hardware.usb.*;
import android.os.Build;
import android.util.AtomicFile;
import com.hoho.android.usbserial.driver.*;
import com.hoho.android.usbserial.util.SerialInputOutputManager;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Owner-confirmed BAR-9 installation profile; CH340 alone does not identify a scale. */
final class Bar9AutoHost {
 private final Context context; private final UsbManager manager; private final String permissionAction;
 private final ScheduledExecutorService control=Executors.newSingleThreadScheduledExecutor();
 private final ScaleTrace trace=new ScaleTrace(); private final ArrayDeque<JSONObject> events=new ArrayDeque<>();
 private boolean active=true,enabled=true,connected,diagnosticSaved,profileSaved;
 private long session,startedAt,sequence,lastRx=-1,lastValid=-1,rxBytes,rxChunks,txBytes,txRequests;
 private int deviceId=-1; private String code="USB_WAITING_DEVICE",operation="SELECT_DEVICE",message="Conecta la báscula RHINO BAR-9 por USB OTG",exceptionClass="",diagnosticWriteError="";
 private UsbDevice device; private UsbDeviceConnection connection; private UsbSerialPort port; private SerialInputOutputManager reader;
 private ScaleAutoSession auto; private ScaleDecoder decoder; private ScaleDecoder.Reading weight;
 private JSONObject verified; private ScaleAutoSession.Attempt currentAttempt;
 private long now(){return android.os.SystemClock.elapsedRealtime();}
 Bar9AutoHost(Context context){
  this.context=context;manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);permissionAction=context.getPackageName()+".BAR9_USB_PERMISSION";
  try{
   String old=context.getSharedPreferences("peripherals",0).getString("scale",null);
   if(old!=null){JSONObject p=new JSONObject(old);if(!ScaleSerialPolicy.approvedBar9Transport(p.optInt("vid"),p.optInt("pid"))){enabled=false;active=false;}}
   String saved=context.getSharedPreferences("peripherals",0).getString("bar9Verified",null);
   if(saved!=null){JSONObject p=new JSONObject(saved);if(ScaleSerialPolicy.WINDOWS_SOURCE_SHA256.equals(p.optString("windowsSourceSHA256"))&&p.optBoolean("validated",false))verified=p;}
  }catch(Exception ignored){}
  IntentFilter filter=new IntentFilter(permissionAction);filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
  BroadcastReceiver receiver=new BroadcastReceiver(){public void onReceive(Context c,Intent intent){UsbDevice d=intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);if(d!=null)control.execute(()->handle(intent.getAction(),d,intent.getLongExtra("bar9Session",-1)));}};
  if(Build.VERSION.SDK_INT>=33)context.registerReceiver(receiver,filter,Context.RECEIVER_NOT_EXPORTED);else context.registerReceiver(receiver,filter);
  control.execute(this::discover);control.scheduleWithFixedDelay(this::tickSafely,100,100,TimeUnit.MILLISECONDS);
 }
 synchronized boolean active(){return active;}
 private boolean approved(UsbDevice d){return ScaleSerialPolicy.approvedBar9Transport(d.getVendorId(),d.getProductId());}
 private synchronized void handle(String action,UsbDevice d,long requested){
  if(permissionAction.equals(action)){
   if(!enabled||requested!=session||deviceId!=d.getDeviceId()||!present(d))return;
   if(manager.hasPermission(d))begin(d);else{code="USB_PERMISSION_DENIED";operation="PERMISSION";message="Android no autorizó el acceso a la báscula";saveFailure();}
  }else if(UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)){
   if(deviceId==d.getDeviceId()){session++;release();auto=null;code="USB_DETACHED";operation="DEVICE_DETACHED";message="Báscula desconectada; se reconectará al volver a conectar USB";event("USB_DETACHED");}
  }else if(enabled&&approved(d)&&!connected)discover();
 }
 private boolean present(UsbDevice d){for(UsbDevice candidate:manager.getDeviceList().values())if(candidate.getDeviceId()==d.getDeviceId()&&approved(candidate))return true;return false;}
 private synchronized void discover(){
  if(!enabled||connected||auto!=null)return;
  List<UsbDevice> candidates=new ArrayList<>();for(UsbDevice d:manager.getDeviceList().values())if(approved(d))candidates.add(d);
  if(candidates.size()>1){active=true;code="USB_SELECTION_AMBIGUOUS";message="Hay varios CH340; no se envían comandos porque no se puede identificar la báscula";resetDiagnostic();saveFailure();return;}
  if(candidates.size()==1)select(candidates.get(0));
 }
 synchronized JSONObject select(UsbDevice d){
  if(!approved(d)||!present(d))throw new IllegalArgumentException("BAR9_USB_DEVICE_NOT_PRESENT");
  enabled=true;active=true;session++;release();auto=null;device=d;deviceId=d.getDeviceId();resetDiagnostic();
  code="USB_PERMISSION_PENDING";operation="PERMISSION";message="Conectando · autoriza el permiso USB de Android";event("PERMISSION_CHECK");
  if(manager.hasPermission(d))begin(d);else{
   int flags=PendingIntent.FLAG_UPDATE_CURRENT;if(Build.VERSION.SDK_INT>=31)flags|=PendingIntent.FLAG_MUTABLE;
   manager.requestPermission(d,PendingIntent.getBroadcast(context,(int)session,new Intent(permissionAction).setPackage(context.getPackageName()).putExtra("bar9Session",session),flags));
  }
  return state();
 }
 private void resetDiagnostic(){startedAt=now();rxBytes=rxChunks=txBytes=txRequests=0;currentAttempt=null;decoder=null;events.clear();trace.startAutomatic(startedAt);diagnosticSaved=false;profileSaved=false;exceptionClass="";diagnosticWriteError="";}
 private synchronized void begin(UsbDevice d){
  if(!enabled||!present(d))return;
  device=d;deviceId=d.getDeviceId();ScaleAutoSession.Attempt prior=null;
  if(verified!=null){Boolean dt=verified.has("dtr")?verified.optBoolean("dtr"):null,rt=verified.has("rts")?verified.optBoolean("rts"):null;prior=new ScaleAutoSession.Attempt(dt,rt,verified.optInt("readTimeoutMs",1000));}
  auto=new ScaleAutoSession(prior);code="USB_CONNECTING";operation="OPEN_DEVICE";message="Conectando · perfil BAR-9 de Windows";event("AUTO_BEGIN");
 }
 private synchronized void tickSafely(){
  try{
   if(!enabled||auto==null)return;
   switch(auto.tick(now())){
    case OPEN:openAttempt();break;
    case POLL:sendWindowsRequest();break;
    case FAILED:
     code=auto.failure();operation="AUTOCONFIGURATION";message="Incompatible · "+failureMessage(code);event("AUTO_EXHAUSTED");saveFailure();release();break;
    default:break;
   }
  }catch(Exception error){exceptionClass=error.getClass().getSimpleName();code="USB_AUTOCONFIGURATION_FAILED";operation="AUTOCONFIGURATION";message="Incompatible · fallo técnico durante la configuración USB";event(code);saveFailure();release();auto=null;}
 }
 private void openAttempt(){
  release();currentAttempt=auto.attempt();String stage="PERMISSION";long expected=session;
  try{
   if(!present(device)){code="USB_DETACHED";auto=null;message="Conecta la báscula para continuar";return;}
   if(!manager.hasPermission(device))throw new SecurityException();
   stage="OPEN_DEVICE";connection=manager.openDevice(device);if(connection==null)throw new IOException();
   stage="SELECT_DRIVER";UsbSerialDriver driver=UsbSerialProber.getDefaultProber().probeDevice(device);if(!(driver instanceof Ch34xSerialDriver))throw new IllegalArgumentException();
   stage="OPEN_PORT";port=driver.getPorts().get(0);port.open(connection);
   stage="SERIAL_PARAMETERS";port.setParameters(9600,8,UsbSerialPort.STOPBITS_1,UsbSerialPort.PARITY_NONE);port.setFlowControl(UsbSerialPort.FlowControl.NONE);
   stage="CONTROL_LINES";if(currentAttempt.dtr!=null){port.setDTR(currentAttempt.dtr);port.setRTS(currentAttempt.rts);}
   decoder=new ScaleDecoder("ascii-auto-safe","auto",40);decoder.setFrameListener((raw,format,safe)->trace.add(now(),raw,"RX",format,safe));
   stage="START_READER";connected=true;UsbDeviceConnection link=connection;
   reader=new SerialInputOutputManager(port,new SerialInputOutputManager.Listener(){public void onNewData(byte[] bytes){accept(bytes,link,expected);}public void onRunError(Exception error){control.execute(()->lost(link,expected,error));}});
   reader.setReadTimeout(currentAttempt.readTimeout);reader.start();
   auto.opened(now());code="USB_DETECTING";operation="READ";message="Detectando · lectura iniciada; solicitando peso";event("READER_STARTED_BEFORE_P");
   if(auto.tick(now())==ScaleAutoSession.Action.POLL)sendWindowsRequest();
  }catch(Exception error){exceptionClass=error.getClass().getSimpleName();code=stage.equals("PERMISSION")?"USB_PERMISSION_DENIED":stage.equals("SERIAL_PARAMETERS")?"SERIAL_CONFIG_FAILED":stage.equals("CONTROL_LINES")?"CONTROL_LINES_FAILED":"USB_OPEN_FAILED";operation=stage;event(code);release();auto.transportFailed(now(),code);}
 }
 private void sendWindowsRequest(){
  if(!connected||port==null)return;
  try{operation="WRITE";byte[] bytes=ScaleSerialPolicy.windowsBar9Command();port.write(bytes,500);txBytes+=bytes.length;txRequests++;trace.add(now(),bytes,"TX","windows-bar9-P",true);operation="READ";}
  catch(Exception error){exceptionClass=error.getClass().getSimpleName();code="USB_WRITE_FAILED";operation="WRITE";event(code);release();auto.transportFailed(now(),code);}
 }
 private synchronized void accept(byte[] bytes,UsbDeviceConnection link,long expected){
  if(!connected||connection!=link||session!=expected||decoder==null||bytes.length==0)return;
  lastRx=now();rxBytes+=bytes.length;rxChunks++;auto.bytes(lastRx,bytes.length);long before=decoder.frameSequence();weight=decoder.feed(bytes);sequence++;
  if(decoder.frameSequence()!=before)auto.reading(weight.code,weight.valid,weight.stable);code=weight.code;message=weight.message;operation="READ";
  if(weight.valid&&decoder.frameSequence()!=before){lastValid=lastRx;if(weight.stable&&!profileSaved)saveVerified();}
 }
 private synchronized void lost(UsbDeviceConnection link,long expected,Exception error){
  if(!connected||connection!=link||session!=expected||auto==null)return;
  exceptionClass=error.getClass().getSimpleName();code="USB_READ_FAILED";operation="READ";event(code);release();auto.transportFailed(now(),code);
 }
 private void saveVerified(){
  try{
   JSONObject p=profile();p.put("validated",true).put("detectedUnit",decoder.reportedUnit()).put("detectedFormat",weight.format);
   context.getSharedPreferences("peripherals",0).edit().putString("bar9Verified",p.toString()).remove("scale").apply();verified=p;profileSaved=true;event("VALID_PROFILE_SAVED");
  }catch(Exception error){event("PROFILE_SAVE_FAILED");}
 }
 private JSONObject profile()throws JSONException{
  JSONObject p=new JSONObject().put("profileRevision",3).put("configuredModel","RHINO BAR-9").put("modelSource","OWNER_CONFIRMED").put("modelInferredFromUsb",false).put("autoBar9",true).put("vid",6790).put("pid",29987).put("deviceId",deviceId).put("driver","ch34x").put("protocol","ascii-auto-safe").put("unit","auto").put("maxKg",40).put("baud",9600).put("dataBits",8).put("parity",0).put("stopBits",1).put("flowControl","none").put("command","P").put("commandConfirmed",true).put("commandSource","APPROVED_WINDOWS_IMPLEMENTATION").put("windowsSourceSHA256",ScaleSerialPolicy.WINDOWS_SOURCE_SHA256).put("pollMs",800);
  p.put("pollMs",auto==null?800:auto.pollIntervalMs()).put("responseTimeoutMs",800);
  if(currentAttempt!=null){p.put("readTimeoutMs",currentAttempt.readTimeout);if(currentAttempt.dtr!=null)p.put("dtr",currentAttempt.dtr).put("rts",currentAttempt.rts);}if(decoder!=null&&!decoder.reportedUnit().isEmpty())p.put("detectedUnit",decoder.reportedUnit());return p;
 }
 synchronized JSONObject state(){
  try{
   long time=now();boolean valid=connected&&weight!=null&&weight.valid&&ScaleSerialPolicy.fresh(time,lastValid);
   String phase=auto==null?(code.equals("USB_PERMISSION_PENDING")?"CONNECTING":code.matches(".*(?:FAILED|DENIED|AMBIGUOUS).*" )?"INCOMPATIBLE":"WAITING"):auto.phase(),currentCode=code,currentMessage=message;
   if(connected&&!valid&&weight!=null&&weight.valid){currentCode="STALE_WEIGHT";currentMessage="La lectura venció; esperando un peso reciente";phase="DETECTING";}
   if(connected&&weight==null&&phase.equals("DETECTING")){currentCode="USB_DETECTING";currentMessage="Detectando · solicitud P enviada; esperando respuesta";}
   if(valid){phase="AVAILABLE";currentMessage="Peso disponible · "+weight.message;}
   return new JSONObject().put("connected",connected).put("valid",valid).put("stable",valid&&weight.stable).put("kg",valid?weight.kg:JSONObject.NULL).put("sequence",sequence).put("ageMs",lastValid<0?-1:time-lastValid).put("lastByteAgeMs",lastRx<0?-1:time-lastRx).put("receivedBytes",rxBytes).put("code",currentCode).put("operation",operation).put("message",currentMessage).put("driver",connected?"Ch34xSerialDriver":"").put("detectedFormat",weight==null?"unknown":weight.format).put("autoPhase",phase).put("diagnosticSaved",diagnosticSaved).put("profileSaved",profileSaved).put("profile",profile());
  }catch(JSONException error){throw new IllegalStateException(error);}
 }
 private void event(String name){
  try{if(events.size()>=96)events.removeFirst();JSONObject e=new JSONObject().put("elapsedMs",now()-startedAt).put("event",name).put("operation",operation).put("attempt",auto==null?0:auto.attemptNumber()).put("exceptionClass",exceptionClass);if(currentAttempt!=null)e.put("transport",currentAttempt.id());events.add(e);}catch(JSONException ignored){}
 }
 private JSONObject currentDiagnostic()throws Exception{
  JSONObject report=state().put("format","ElMuellePDV-USB-diagnostic-v2").put("automatic",true).put("modelInferred",false).put("exceptionClass",exceptionClass).put("receivedChunks",rxChunks).put("transmittedBytes",txBytes).put("transmittedRequests",txRequests).put("responseTimeouts",auto==null?0:auto.requestTimeouts()).put("completedFrames",decoder==null?0:decoder.frameSequence()).put("captureActive",trace.capturing(now())).put("captureWindowMs",60000).put("unknownPayloadsRedacted",true).put("diagnosticWriteError",diagnosticWriteError).put("attemptLimit",auto==null?6:auto.attemptLimit());
  JSONArray log=new JSONArray();for(JSONObject e:events)log.put(e);report.put("events",log);
  JSONArray frames=new JSONArray();for(ScaleTrace.Entry e:trace.snapshot())frames.put(new JSONObject().put("elapsedMs",e.elapsedMs).put("direction",e.direction).put("format",e.format).put("capturedBytes",e.bytes).put("redacted",e.redacted).put("hex",e.hex).put("ascii",e.ascii));report.put("frames",frames);
  if(device!=null){JSONArray interfaces=new JSONArray();for(int i=0;i<device.getInterfaceCount();i++){UsbInterface f=device.getInterface(i);JSONArray endpoints=new JSONArray();for(int j=0;j<f.getEndpointCount();j++){UsbEndpoint ep=f.getEndpoint(j);endpoints.put(new JSONObject().put("address",ep.getAddress()).put("type",ep.getType()).put("maxPacketSize",ep.getMaxPacketSize()));}interfaces.put(new JSONObject().put("id",f.getId()).put("class",f.getInterfaceClass()).put("endpoints",endpoints));}report.put("usbInterfaces",interfaces);}return report;
 }
 private AtomicFile diagnosticFile(){return new AtomicFile(new File(context.getNoBackupFilesDir(),"usb-diagnostics/last-failure.json"));}
 private void saveFailure(){
  if(diagnosticSaved)return;
  AtomicFile file=diagnosticFile();FileOutputStream output=null;
  try{
   File parent=file.getBaseFile().getParentFile();if(!parent.isDirectory()&&!parent.mkdirs())throw new IOException();
   JSONObject report=currentDiagnostic().put("failureCode",code).put("failureOperation",operation).put("savedAutomatically",true).put("sentToInternet",false);
   byte[] bytes=report.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>65536)throw new IOException();output=file.startWrite();output.write(bytes);file.finishWrite(output);diagnosticSaved=true;trace.stop();
  }catch(Exception error){if(output!=null)file.failWrite(output);diagnosticWriteError=error.getClass().getSimpleName();}
 }
 synchronized JSONObject diagnostics()throws Exception{
  JSONObject value=currentDiagnostic();File f=diagnosticFile().getBaseFile();if(f.isFile()&&f.length()<=65536){try(InputStream in=diagnosticFile().openRead()){ByteArrayOutputStream buffer=new ByteArrayOutputStream();byte[] chunk=new byte[4096];int n;while((n=in.read(chunk))!=-1){if(buffer.size()+n>65536)throw new IOException();buffer.write(chunk,0,n);}value.put("lastAutomaticFailure",new JSONObject(new String(buffer.toByteArray(),StandardCharsets.UTF_8)));}}return value;
 }
 synchronized JSONObject startTrace()throws Exception{if(!diagnosticSaved&&auto!=null&&!auto.phase().equals("AVAILABLE"))return diagnostics();trace.start(now());return diagnostics();}
 synchronized JSONObject stopTrace()throws Exception{if(auto==null||auto.phase().equals("AVAILABLE")||diagnosticSaved)trace.stop();return diagnostics();}
 private void release(){connected=false;weight=null;lastRx=lastValid=-1;sequence++;if(reader!=null){reader.stop();reader=null;}if(port!=null){try{port.close();}catch(Exception ignored){}port=null;}if(connection!=null){connection.close();connection=null;}}
 synchronized void close(){session++;enabled=false;active=false;release();auto=null;trace.stop();code="DISCONNECTED";operation="CLOSE";message="Báscula desconectada por el usuario";}
 private String failureMessage(String value){switch(value){case "NO_DATA_AFTER_WINDOWS_P":return "sin respuesta RX después de P (0x50) y de los ajustes limitados del controlador";case "FORMAT_UNKNOWN":return "se recibieron bytes, pero no una trama de peso reconocida";case "WAITING_STABILITY":case "UNSTABLE_WEIGHT":return "no se obtuvo un peso estable durante la detección";case "WEIGHT_OR_UNIT_RANGE":return "peso o unidad fuera de los límites de BAR-9";case "INCOMPLETE_FRAME":return "se recibieron datos sin una trama de peso completa";default:return value;}}
}
