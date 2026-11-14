package mx.elmuelle.pdv;
import android.bluetooth.*;import android.app.PendingIntent;import android.content.*;import android.content.pm.PackageManager;import android.hardware.usb.*;import android.os.Build;import android.util.Base64;import org.json.*;import java.util.*;import java.io.*;
/** ESC/POS transports only. Actual model/encoding/cutter support requires a physical test. */
public final class PrinterHost {
 private final Context context;private JSONObject profile;private volatile int explicitSessionId=-1;private final Set<Integer> requestedPermissions=new HashSet<>();
 PrinterHost(Context context){this.context=context;try{String saved=context.getSharedPreferences("peripherals",0).getString("printer",null);if(saved!=null)profile=new JSONObject(saved);}catch(Exception ignored){}
  IntentFilter filter=new IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED);
  BroadcastReceiver receiver=new BroadcastReceiver(){public void onReceive(Context c,Intent intent){UsbDevice device=intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);if(device!=null)synchronized(PrinterHost.this){requestedPermissions.remove(device.getDeviceId());if(explicitSessionId==device.getDeviceId())explicitSessionId=-1;}}};
  if(Build.VERSION.SDK_INT>=33)context.registerReceiver(receiver,filter,Context.RECEIVER_NOT_EXPORTED);else context.registerReceiver(receiver,filter);
 }
 private String serial(UsbManager manager,UsbDevice device){try{return manager.hasPermission(device)?Objects.toString(device.getSerialNumber(),""):"";}catch(Exception ignored){return "";}}
 private UsbDevice rememberedUsb(JSONObject saved)throws Exception{
  UsbManager manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);List<PeripheralPolicy.UsbIdentity> values=new ArrayList<>();
  for(UsbDevice d:manager.getDeviceList().values())for(int i=0;i<d.getInterfaceCount();i++){UsbInterface f=d.getInterface(i);if(f.getInterfaceClass()==UsbConstants.USB_CLASS_PRINTER)values.add(new PeripheralPolicy.UsbIdentity(d.getDeviceId(),d.getVendorId(),d.getProductId(),f.getId(),serial(manager,d)));}
  int id=PeripheralPolicy.selectUsb(values,saved.getInt("vid"),saved.getInt("pid"),saved.getInt("interface"),saved.optString("serial"),explicitSessionId);
  // Permission may hide a serial number after restart. A sole matching USB can
  // request permission, but printing still requires the stored serial to match.
  if(id<0&&!saved.optString("serial").isEmpty()){
   int candidate=PeripheralPolicy.selectUsb(values,saved.getInt("vid"),saved.getInt("pid"),saved.getInt("interface"),"",-1);
   for(UsbDevice d:manager.getDeviceList().values())if(d.getDeviceId()==candidate&&!manager.hasPermission(d))return d;
  }
  for(UsbDevice d:manager.getDeviceList().values())if(d.getDeviceId()==id)return d;return null;
 }
 private void permission(UsbManager manager,UsbDevice selected){if(!requestedPermissions.add(selected.getDeviceId()))return;int flags=PendingIntent.FLAG_UPDATE_CURRENT;if(Build.VERSION.SDK_INT>=31)flags|=PendingIntent.FLAG_MUTABLE;manager.requestPermission(selected,PendingIntent.getBroadcast(context,2,new Intent(context.getPackageName()+".PRINTER_USB_PERMISSION").setPackage(context.getPackageName()),flags));}
 synchronized JSONObject profileSnapshot()throws Exception{return profile==null?null:new JSONObject(profile.toString());}
 synchronized void reconnectRemembered()throws Exception{
  if(profile==null||!profile.optString("transport").equals("usb"))return;UsbDevice d=rememberedUsb(profile);if(d==null)return;
  UsbManager manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);if(!manager.hasPermission(d)){permission(manager,d);return;}
  String before=profile.toString();profile.put("deviceId",d.getDeviceId());String serial=serial(manager,d);if(!serial.isEmpty())profile.put("serial",serial);
  if(!before.equals(profile.toString()))context.getSharedPreferences("peripherals",0).edit().putString("printer",profile.toString()).apply();
 }
 public JSONArray devices()throws Exception {JSONArray out=new JSONArray();UsbManager manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);for(UsbDevice d:manager.getDeviceList().values())for(int i=0;i<d.getInterfaceCount();i++){UsbInterface f=d.getInterface(i);if(f.getInterfaceClass()==UsbConstants.USB_CLASS_PRINTER)out.put(new JSONObject().put("transport","usb").put("deviceId",d.getDeviceId()).put("vid",d.getVendorId()).put("pid",d.getProductId()).put("interface",f.getId()).put("name",d.getProductName()));}if(Build.VERSION.SDK_INT<31||context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED){BluetoothManager service=(BluetoothManager)context.getSystemService(Context.BLUETOOTH_SERVICE);BluetoothAdapter adapter=service==null?null:service.getAdapter();if(adapter!=null)for(BluetoothDevice d:adapter.getBondedDevices())out.put(new JSONObject().put("transport","bluetooth").put("address",d.getAddress()).put("name",d.getName()));}return out;}
 public synchronized JSONObject configure(JSONObject value)throws Exception {
  String type=value.getString("transport");if(!type.equals("usb")&&!type.equals("bluetooth")&&!type.equals("lan"))throw new IllegalArgumentException();if(!value.optString("protocol","escpos").equals("escpos"))throw new IllegalArgumentException();
  if(type.equals("lan"))PrinterNetworkPolicy.validate(value.getString("host"),value.optInt("port",9100));
  boolean permissionPending=false;
  if(type.equals("bluetooth")&&!BluetoothAdapter.checkBluetoothAddress(value.getString("address")))throw new IllegalArgumentException();
  if(type.equals("usb")){
   UsbManager manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);UsbDevice selected=null;
   for(UsbDevice d:manager.getDeviceList().values())if(d.getDeviceId()==value.getInt("deviceId")&&d.getVendorId()==value.getInt("vid")&&d.getProductId()==value.getInt("pid"))for(int i=0;i<d.getInterfaceCount();i++)if(d.getInterface(i).getId()==value.getInt("interface")&&d.getInterface(i).getInterfaceClass()==UsbConstants.USB_CLASS_PRINTER)selected=d;
   if(selected==null)throw new IllegalArgumentException();
   explicitSessionId=selected.getDeviceId();if(!manager.hasPermission(selected)){requestedPermissions.remove(selected.getDeviceId());permission(manager,selected);permissionPending=true;}
  }
  JSONObject selected=new JSONObject().put("transport",type).put("protocol","escpos");if(type.equals("lan"))selected.put("host",value.getString("host")).put("port",value.optInt("port",9100));else if(type.equals("bluetooth"))selected.put("address",value.getString("address"));else for(String field:new String[]{"deviceId","vid","pid","interface"})selected.put(field,value.getInt(field));
  if(type.equals("usb")){UsbManager manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);for(UsbDevice d:manager.getDeviceList().values())if(d.getDeviceId()==explicitSessionId){String serial=serial(manager,d);if(!serial.isEmpty())selected.put("serial",serial);}}
  profile=selected;context.getSharedPreferences("peripherals",0).edit().putString("printer",profile.toString()).apply();return new JSONObject().put("configured",true).put("permissionPending",permissionPending).put("physicalCompatibilityVerified",false);
 }
 public synchronized JSONObject status()throws Exception{
  JSONObject out=new JSONObject().put("configured",profile!=null).put("profile",profile==null?JSONObject.NULL:new JSONObject(profile.toString()));String message="Elige un equipo detectado una vez; después se recordará.";
  if(profile!=null&&profile.optString("transport").equals("usb")){UsbDevice d=rememberedUsb(profile);boolean present=d!=null,permission=present&&((UsbManager)context.getSystemService(Context.USB_SERVICE)).hasPermission(d);out.put("available",permission).put("permissionRequired",present&&!permission);message=permission?"USB disponible; se abrirá al imprimir.":present?"Autoriza el permiso USB de Android.":"Esperando la impresora USB recordada; si hay varias iguales, selecciona una.";}
  else if(profile!=null&&profile.optString("transport").equals("bluetooth"))message="Bluetooth recordado; Android debe estar encendido y el equipo emparejado. Se conecta al imprimir.";
  else if(profile!=null)message="LAN guardada; comprobación automática sin enviar papel.";
  return out.put("message",message);
 }
 public JSONObject testConnection()throws Exception{if(profile==null||!profile.getString("transport").equals("lan"))throw new IllegalStateException("Selecciona una impresora LAN primero.");LanPrinterTransport.send(profile.getString("host"),profile.getInt("port"),new byte[0],java.net.Socket::new);return new JSONObject().put("tcpConnected",true).put("paperOutputVerified",false);}
 public JSONObject print(String data)throws Exception {
  JSONObject profile=profileSnapshot();
  if(profile==null)throw new IllegalStateException();byte[] bytes=Base64.decode(data,Base64.NO_WRAP);if(bytes.length>1048576)throw new IllegalArgumentException();
  if(profile.getString("transport").equals("lan")){LanPrinterTransport.send(profile.getString("host"),profile.getInt("port"),bytes,java.net.Socket::new);
  }else if(profile.getString("transport").equals("bluetooth")){
   BluetoothManager service=(BluetoothManager)context.getSystemService(Context.BLUETOOTH_SERVICE);if(service==null||service.getAdapter()==null)throw new IllegalStateException();BluetoothDevice d=service.getAdapter().getRemoteDevice(profile.getString("address"));try(BluetoothSocket socket=d.createRfcommSocketToServiceRecord(UUID.fromString("00001101-0000-1000-8000-00805F9B34FB"))){java.util.concurrent.FutureTask<Void> task=new java.util.concurrent.FutureTask<>(()->{socket.connect();socket.getOutputStream().write(bytes);socket.getOutputStream().flush();return null;});Thread writer=new Thread(task,"muelle-printer");writer.setDaemon(true);writer.start();try{task.get(10,java.util.concurrent.TimeUnit.SECONDS);}catch(java.util.concurrent.TimeoutException timeout){task.cancel(true);throw new IOException("La impresora Bluetooth no respondió en 10 segundos.");}}
  }else{
   UsbManager manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);UsbDevice device=rememberedUsb(profile);if(device==null)throw new IOException("Impresora USB ausente o ambigua; selecciona el equipo recordado.");if(!manager.hasPermission(device))throw new SecurityException();UsbDeviceConnection link=manager.openDevice(device);if(link==null)throw new IllegalStateException();
   try{boolean sent=false;for(int i=0;i<device.getInterfaceCount();i++){UsbInterface f=device.getInterface(i);if(f.getId()!=profile.getInt("interface")||f.getInterfaceClass()!=UsbConstants.USB_CLASS_PRINTER)continue;for(int j=0;j<f.getEndpointCount();j++){UsbEndpoint e=f.getEndpoint(j);if(e.getDirection()==UsbConstants.USB_DIR_OUT&&e.getType()==UsbConstants.USB_ENDPOINT_XFER_BULK&&link.claimInterface(f,true)){int at=0;long deadline=android.os.SystemClock.elapsedRealtime()+10000;while(at<bytes.length){long remaining=deadline-android.os.SystemClock.elapsedRealtime();if(remaining<=0)throw new IOException("La impresora USB tardó demasiado; revisa el papel antes de reimprimir.");int n=link.bulkTransfer(e,bytes,at,Math.min(4096,bytes.length-at),(int)Math.min(3000,remaining));if(n<=0)throw new IOException();at+=n;}link.releaseInterface(f);sent=true;break;}}}if(!sent)throw new IllegalStateException();}finally{link.close();}
  }return new JSONObject().put("sentToTransport",true).put("paperOutputVerified",false);
 }
}
