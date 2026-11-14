package mx.elmuelle.pdv;
import android.app.PendingIntent;import android.content.*;import android.hardware.usb.*;import android.os.Build;import org.json.*;import java.util.*;import java.util.concurrent.*;
import com.hoho.android.usbserial.driver.*;import com.hoho.android.usbserial.util.SerialInputOutputManager;
public final class UsbScaleHost {
 private final Bar9AutoHost automatic;
 private final Context context;private final UsbManager manager;private final ScheduledExecutorService control=Executors.newSingleThreadScheduledExecutor();private final ScaleTrace trace=new ScaleTrace();
 private UsbSerialPort port;private UsbDeviceConnection connection;private SerialInputOutputManager reader;private UsbDevice activeDevice;
 private boolean connected,reconnectRequested;private ScaleDecoder decoder;private ScaleDecoder.Reading weight;private long lastFrameAt=-1;private long lastRx=-1,lastValid=-1,openedAt=-1,sequence,session,rxBytes,rxChunks;private JSONObject profile;
 private String code="DISCONNECTED",operation="SELECT_DEVICE",message="Selecciona un dispositivo USB; el modelo de báscula no se ha confirmado",actualDriver="",exceptionClass="";
 private final String permissionAction;
 private long now(){return android.os.SystemClock.elapsedRealtime();}
 public UsbScaleHost(Context value){
  context=value;manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);permissionAction=context.getPackageName()+".USB_PERMISSION";
  automatic=new Bar9AutoHost(context);
  IntentFilter filter=new IntentFilter(permissionAction);filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
  BroadcastReceiver receiver=new BroadcastReceiver(){public void onReceive(Context c,Intent intent){UsbDevice device=intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);if(device!=null)control.execute(()->handle(intent.getAction(),device,intent.getLongExtra("scaleSession",-1)));}};
  if(Build.VERSION.SDK_INT>=33)context.registerReceiver(receiver,filter,Context.RECEIVER_NOT_EXPORTED);else context.registerReceiver(receiver,filter);
  try{String saved=context.getSharedPreferences("peripherals",0).getString("scale",null);if(saved!=null){JSONObject p=new JSONObject(saved);if(!ScaleSerialPolicy.approvedBar9Transport(p.optInt("vid"),p.optInt("pid"))){profile=clean(p,true);reconnectRequested=true;}}}catch(Exception ignored){code="PROFILE_INVALID";message="El perfil USB guardado necesita revisión";}
  control.execute(()->reconnect(session));
  control.scheduleWithFixedDelay(this::poll,500,500,TimeUnit.MILLISECONDS);
 }
 private JSONObject clean(JSONObject input,boolean saved)throws Exception {
  int baud=input.optInt("baud",9600),bits=input.optInt("dataBits",8),stop=input.optInt("stopBits",1),parity=input.optInt("parity",0),index=input.optInt("port",0);double max=input.optDouble("maxKg",1000);
  String unit=input.optString("unit","kg"),driver=input.optString("driver","auto"),protocol=input.optString("protocol","ascii-auto-safe");
  if(saved&&input.optInt("profileRevision",0)<2&&!protocol.equals("hid-pos-scale"))protocol="ascii-auto-safe";
  if(!Arrays.asList(1200,2400,4800,9600,19200,38400,57600,115200).contains(baud)||bits<5||bits>8||stop<1||stop>2||parity<0||parity>4||index<0||index>7||!Arrays.asList("auto","cdc","ftdi","cp210x","ch34x","pl2303","hid").contains(driver))throw new IllegalArgumentException("SERIAL_CONFIG_INVALID");
  new ScaleDecoder(protocol,unit,max);boolean confirmed=input.optBoolean("commandConfirmed",false);String command=input.optString("command","");
  byte[] allowed=ScaleSerialPolicy.command(command,confirmed);command=new String(allowed,java.nio.charset.StandardCharsets.US_ASCII);
  JSONObject out=new JSONObject().put("profileRevision",2).put("deviceId",input.optInt("deviceId",-1)).put("vid",input.optInt("vid",-1)).put("pid",input.optInt("pid",-1)).put("driver",driver).put("protocol",protocol).put("baud",baud).put("dataBits",bits).put("stopBits",stop).put("parity",parity).put("port",index).put("unit",unit).put("maxKg",max).put("command",command).put("commandConfirmed",confirmed&&!command.isEmpty());
  if(input.has("dtr"))out.put("dtr",input.optBoolean("dtr"));if(input.has("rts"))out.put("rts",input.optBoolean("rts"));return out;
 }
 private boolean matches(UsbDevice d){return profile!=null&&d.getVendorId()==profile.optInt("vid")&&d.getProductId()==profile.optInt("pid");}
 private synchronized void handle(String action,UsbDevice device,long requested){
  if(permissionAction.equals(action)){
   if(!reconnectRequested||profile==null||requested!=session||device.getDeviceId()!=profile.optInt("deviceId"))return;
   if(manager.hasPermission(device))connect(device,session);else{reconnectRequested=false;release("USB_PERMISSION_DENIED","PERMISSION","Android no autorizó el acceso USB");}
  }else if(UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)){
   if(activeDevice!=null&&activeDevice.getDeviceId()==device.getDeviceId())release("USB_DETACHED","DEVICE_DETACHED","Se desconectó el cable o dispositivo USB");
  }else if(reconnectRequested&&matches(device))reconnect(session);
 }
 public synchronized JSONArray devices()throws Exception {
  JSONArray out=new JSONArray();for(UsbDevice d:manager.getDeviceList().values()){
   JSONArray interfaces=new JSONArray();for(int i=0;i<d.getInterfaceCount();i++){UsbInterface f=d.getInterface(i);interfaces.put(new JSONObject().put("id",f.getId()).put("class",f.getInterfaceClass()).put("subclass",f.getInterfaceSubclass()).put("protocol",f.getInterfaceProtocol()).put("endpoints",f.getEndpointCount()));}
   UsbSerialDriver driver=UsbSerialProber.getDefaultProber().probeDevice(d);String detected=driver==null?"Sin controlador serial identificado":driver.getClass().getSimpleName();
   out.put(new JSONObject().put("deviceId",d.getDeviceId()).put("vid",d.getVendorId()).put("pid",d.getProductId()).put("name",ScaleSerialPolicy.isCh34x(d.getVendorId(),d.getProductId())?"Adaptador CH340/CH341":"Dispositivo USB").put("permission",manager.hasPermission(d)).put("driver",detected).put("interfaces",interfaces));
  }return out;
 }
 public synchronized JSONObject state()throws Exception {
  if(automatic.active())return automatic.state();
  long time=now(),rxAge=lastRx<0?-1:time-lastRx,age=lastValid<0?-1:time-lastValid;boolean valid=connected&&weight!=null&&weight.valid&&ScaleSerialPolicy.fresh(time,lastValid);
  String currentCode=code,currentMessage=message;
  if(connected){if(rxBytes==0){currentCode=time-openedAt>3000?"NO_DATA":"WAITING_BYTES";currentMessage="Puerto USB abierto; "+(rxBytes==0?"no se han recibido bytes":"esperando datos");}
   else if(rxAge>1500){currentCode="STALE_DATA";currentMessage="El puerto está abierto, pero dejó de recibir datos recientes";}
   else if(weight!=null){currentCode=weight.code;currentMessage=weight.message;if(weight.valid&&!valid){currentCode="STALE_WEIGHT";currentMessage="La última trama de peso venció; los separadores vacíos no la renuevan";}}}
  return new JSONObject().put("connected",connected).put("valid",valid).put("stable",valid&&weight.stable).put("kg",valid?weight.kg:JSONObject.NULL).put("displayKg",ScaleDisplay.available(weight,connected,time,lastFrameAt)?weight.kg:JSONObject.NULL).put("sequence",sequence).put("ageMs",age).put("lastByteAgeMs",rxAge).put("receivedBytes",rxBytes).put("code",currentCode).put("operation",operation).put("message",currentMessage).put("driver",actualDriver).put("detectedFormat",weight==null?"unknown":weight.format).put("profile",profile==null?JSONObject.NULL:profile);
 }
 public synchronized JSONObject open(JSONObject input)throws Exception {
  for(UsbDevice d:manager.getDeviceList().values())if(d.getDeviceId()==input.optInt("deviceId")&&ScaleSerialPolicy.approvedBar9Transport(d.getVendorId(),d.getProductId())){session++;reconnectRequested=false;release("DISCONNECTED","CLOSE","Usando configuración automática BAR-9");profile=null;return automatic.select(d);}
  automatic.close();
  JSONObject next=clean(input,false);UsbDevice chosen=null;for(UsbDevice d:manager.getDeviceList().values())if(d.getDeviceId()==next.optInt("deviceId"))chosen=d;
  if(chosen==null)throw new IllegalArgumentException("USB_DEVICE_NOT_PRESENT");
  if(ScaleSerialPolicy.isCh34x(chosen.getVendorId(),chosen.getProductId())&&!Arrays.asList("auto","ch34x").contains(next.getString("driver")))throw new IllegalArgumentException("CH340_DRIVER_MISMATCH");
  session++;release("SELECTING_DEVICE","SELECT_DEVICE","Seleccionando dispositivo USB");trace.start(now());trace.stop();rxBytes=0;rxChunks=0;decoder=null;actualDriver="";
  profile=next.put("vid",chosen.getVendorId()).put("pid",chosen.getProductId());reconnectRequested=true;exceptionClass="";
  context.getSharedPreferences("peripherals",0).edit().putString("scale",profile.toString()).apply();long attempt=session;UsbDevice device=chosen;
  if(manager.hasPermission(device))control.execute(()->connect(device,attempt));else{
   code="USB_PERMISSION_PENDING";operation="PERMISSION";message="Autoriza el acceso USB en Android";
   int flags=PendingIntent.FLAG_UPDATE_CURRENT;if(Build.VERSION.SDK_INT>=31)flags|=PendingIntent.FLAG_MUTABLE;
   manager.requestPermission(device,PendingIntent.getBroadcast(context,(int)attempt,new Intent(permissionAction).setPackage(context.getPackageName()).putExtra("scaleSession",attempt),flags));
  }return state();
 }
 private synchronized void reconnect(long attempt){
  if(!reconnectRequested||connected||profile==null||attempt!=session)return;
  List<UsbDevice> candidates=new ArrayList<>();for(UsbDevice d:manager.getDeviceList().values())if(matches(d))candidates.add(d);
  if(candidates.size()>1){code="USB_SELECTION_AMBIGUOUS";operation="SELECT_DEVICE";message="Hay varios adaptadores iguales; selecciona el dispositivo";return;}
  if(candidates.size()==1){UsbDevice d=candidates.get(0);if(manager.hasPermission(d)){try{profile.put("deviceId",d.getDeviceId());}catch(Exception ignored){}connect(d,attempt);}else{code="USB_PERMISSION_REQUIRED";operation="PERMISSION";message="Selecciona el dispositivo para autorizar el acceso USB";}}
 }
 private synchronized void connect(UsbDevice device,long attempt){
  if(!reconnectRequested||attempt!=session||!matches(device))return;
  release("USB_OPENING","OPEN_DEVICE","Abriendo dispositivo USB");actualDriver="";String stage="PERMISSION";
  try{
   if(!manager.hasPermission(device))throw new SecurityException();stage="OPEN_DEVICE";connection=manager.openDevice(device);if(connection==null)throw new IllegalStateException();activeDevice=device;
   decoder=new ScaleDecoder(profile.getString("protocol"),profile.getString("unit"),profile.getDouble("maxKg"));decoder.setFrameListener((bytes,format,safe)->trace.add(now(),bytes,"RX",format,safe));
   if(profile.getString("driver").equals("hid")){stage="HID_INTERFACE";openHid(device);return;}
   stage="SELECT_DRIVER";UsbSerialDriver driver=UsbSerialProber.getDefaultProber().probeDevice(device);
   switch(profile.getString("driver")){case "cdc":driver=new CdcAcmSerialDriver(device);break;case "ftdi":driver=new FtdiSerialDriver(device);break;case "cp210x":driver=new Cp21xxSerialDriver(device);break;case "ch34x":driver=new Ch34xSerialDriver(device);break;case "pl2303":driver=new ProlificSerialDriver(device);break;}
   if(driver==null)throw new UnsupportedOperationException();actualDriver=driver.getClass().getSimpleName();
   stage="OPEN_PORT";int index=profile.getInt("port");if(index>=driver.getPorts().size())throw new IllegalArgumentException();port=driver.getPorts().get(index);port.open(connection);
   stage="SERIAL_PARAMETERS";port.setParameters(profile.getInt("baud"),profile.getInt("dataBits"),profile.getInt("stopBits"),profile.getInt("parity"));
   stage="CONTROL_LINES";if(profile.has("dtr"))port.setDTR(profile.getBoolean("dtr"));if(profile.has("rts"))port.setRTS(profile.getBoolean("rts"));
   stage="START_READER";connected=true;openedAt=now();rxBytes=0;rxChunks=0;code="WAITING_BYTES";operation="READ";message="Puerto abierto; esperando bytes de la báscula";
   UsbDeviceConnection link=connection;reader=new SerialInputOutputManager(port,new SerialInputOutputManager.Listener(){public void onNewData(byte[] bytes){accept(bytes,link);}public void onRunError(Exception error){lost(link,"USB_READ_FAILED","READ",error);}});reader.setReadTimeout(1000);reader.start();
  }catch(Exception error){String failure=stage.equals("PERMISSION")?"USB_PERMISSION_DENIED":stage.equals("SERIAL_PARAMETERS")?"SERIAL_CONFIG_FAILED":stage.equals("SELECT_DRIVER")?"USB_DRIVER_NOT_FOUND":"USB_OPEN_FAILED";release(failure,stage,"No se completó la etapa USB: "+stage);exceptionClass=error.getClass().getSimpleName();}
 }
 private synchronized void poll(){if(!connected||port==null||profile==null)return;UsbDeviceConnection link=connection;try{byte[] command=ScaleSerialPolicy.command(profile.optString("command",""),profile.optBoolean("commandConfirmed",false));if(command.length>0){operation="WRITE";port.write(command,500);trace.add(now(),command,"TX","confirmed-P",true);operation="READ";}}catch(Exception error){lost(link,"USB_WRITE_FAILED","WRITE",error);}}
 private void openHid(UsbDevice device)throws Exception {
  if(!profile.getString("protocol").equals("hid-pos-scale"))throw new IllegalArgumentException();UsbInterface selected=null;UsbEndpoint endpoint=null;
  for(int i=0;i<device.getInterfaceCount();i++){UsbInterface f=device.getInterface(i);if(f.getInterfaceClass()!=UsbConstants.USB_CLASS_HID)continue;byte[] descriptor=new byte[4096];int n=connection.controlTransfer(0x81,6,0x2200,f.getId(),descriptor,descriptor.length,1000);boolean usage=false;for(int k=0;k+2<n;k++)if(descriptor[k]==5&&(descriptor[k+1]&255)==0x8d||descriptor[k]==6&&(descriptor[k+1]&255)==0x8d&&descriptor[k+2]==0)usage=true;if(!usage)continue;for(int j=0;j<f.getEndpointCount();j++){UsbEndpoint e=f.getEndpoint(j);if(e.getDirection()==UsbConstants.USB_DIR_IN&&e.getType()==UsbConstants.USB_ENDPOINT_XFER_INT){selected=f;endpoint=e;break;}}if(endpoint!=null)break;}
  if(selected==null||endpoint==null||!connection.claimInterface(selected,true))throw new IllegalArgumentException();connected=true;openedAt=now();rxBytes=0;rxChunks=0;actualDriver="HID-POS-Scale";operation="READ";UsbEndpoint input=endpoint;UsbDeviceConnection link=connection;
  new Thread(()->{while(isCurrent(link)){byte[] bytes=new byte[input.getMaxPacketSize()];UsbRequest request=new UsbRequest();try{if(!request.initialize(link,input))throw new IllegalStateException();java.nio.ByteBuffer buffer=java.nio.ByteBuffer.wrap(bytes);if(!request.queue(buffer))throw new IllegalStateException();try{if(link.requestWait(1200)==request&&buffer.position()>0)accept(Arrays.copyOf(bytes,buffer.position()),link);else request.cancel();}catch(java.util.concurrent.TimeoutException timeout){request.cancel();}}catch(Exception error){lost(link,"USB_READ_FAILED","HID_READ",error);break;}finally{request.close();}}},"scale-hid").start();
 }
 private synchronized boolean isCurrent(UsbDeviceConnection link){return connected&&connection==link;}
 private synchronized void accept(byte[] bytes,UsbDeviceConnection expected){if(!isCurrent(expected)||decoder==null||bytes.length==0)return;lastRx=now();rxBytes+=bytes.length;rxChunks++;long previous=decoder.frameSequence();weight=decoder.feed(bytes);if(decoder.frameSequence()!=previous)lastFrameAt=lastRx;if(weight.valid&&decoder.frameSequence()!=previous)lastValid=lastRx;sequence++;message=weight.message;code=weight.code;operation="READ";}
 private synchronized void lost(UsbDeviceConnection expected,String failure,String stage,Exception error){if(!isCurrent(expected))return;release(failure,stage,"Se perdió la comunicación USB durante "+stage);exceptionClass=error.getClass().getSimpleName();long attempt=session;for(int n=1;n<=3;n++)control.schedule(()->reconnect(attempt),n*2,TimeUnit.SECONDS);}
 private synchronized void release(String failure,String stage,String reason){connected=false;lastRx=-1;lastValid=-1;weight=null;sequence++;if(decoder!=null)decoder.disconnect();if(reader!=null){reader.stop();reader=null;}if(port!=null){try{port.close();}catch(Exception ignored){}port=null;}if(connection!=null){connection.close();connection=null;}activeDevice=null;code=failure;operation=stage;message=reason;}
 public synchronized void close(){automatic.close();session++;reconnectRequested=false;trace.stop();release("DISCONNECTED","CLOSE","Báscula desconectada por el usuario");}
 public synchronized JSONObject diagnostics()throws Exception {
  if(automatic.active())return automatic.diagnostics();
  JSONObject report=state();report.put("format","ElMuellePDV-USB-diagnostic-v1").put("modelInferred",false).put("exceptionClass",exceptionClass).put("receivedChunks",rxChunks).put("completedFrames",decoder==null?0:decoder.frameSequence()).put("captureActive",trace.capturing(now())).put("captureWindowMs",20000).put("perFrameByteLimit",128).put("unknownPayloadsRedacted",true);
  JSONArray frames=new JSONArray();for(ScaleTrace.Entry e:trace.snapshot())frames.put(new JSONObject().put("elapsedMs",e.elapsedMs).put("direction",e.direction).put("format",e.format).put("capturedBytes",e.bytes).put("redacted",e.redacted).put("hex",e.hex).put("ascii",e.ascii));report.put("frames",frames);return report;
 }
 public synchronized JSONObject startTrace()throws Exception {if(automatic.active())return automatic.startTrace();trace.start(now());return diagnostics();}
 public synchronized JSONObject stopTrace()throws Exception {if(automatic.active())return automatic.stopTrace();trace.stop();return diagnostics();}
}
