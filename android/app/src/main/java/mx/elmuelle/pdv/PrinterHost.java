package mx.elmuelle.pdv;
import android.bluetooth.*;import android.app.PendingIntent;import android.content.*;import android.content.pm.PackageManager;import android.hardware.usb.*;import android.os.Build;import android.util.Base64;import org.json.*;import java.util.*;import java.io.*;
/** ESC/POS transports only. Actual model/encoding/cutter support requires a physical test. */
public final class PrinterHost {
 private final Context context;private JSONObject profile;
 PrinterHost(Context context){this.context=context;try{String saved=context.getSharedPreferences("peripherals",0).getString("printer",null);if(saved!=null)profile=new JSONObject(saved);}catch(Exception ignored){}}
 public JSONArray devices()throws Exception {JSONArray out=new JSONArray();UsbManager manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);for(UsbDevice d:manager.getDeviceList().values())for(int i=0;i<d.getInterfaceCount();i++){UsbInterface f=d.getInterface(i);if(f.getInterfaceClass()==UsbConstants.USB_CLASS_PRINTER)out.put(new JSONObject().put("transport","usb").put("deviceId",d.getDeviceId()).put("vid",d.getVendorId()).put("pid",d.getProductId()).put("interface",f.getId()).put("name",d.getProductName()));}if(Build.VERSION.SDK_INT<31||context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED){BluetoothManager service=(BluetoothManager)context.getSystemService(Context.BLUETOOTH_SERVICE);BluetoothAdapter adapter=service==null?null:service.getAdapter();if(adapter!=null)for(BluetoothDevice d:adapter.getBondedDevices())out.put(new JSONObject().put("transport","bluetooth").put("address",d.getAddress()).put("name",d.getName()));}return out;}
 public JSONObject configure(JSONObject value)throws Exception {
  String type=value.getString("transport");if(!type.equals("usb")&&!type.equals("bluetooth"))throw new IllegalArgumentException();if(!value.optString("protocol","escpos").equals("escpos"))throw new IllegalArgumentException();
  boolean permissionPending=false;
  if(type.equals("bluetooth")&&!BluetoothAdapter.checkBluetoothAddress(value.getString("address")))throw new IllegalArgumentException();
  if(type.equals("usb")){
   UsbManager manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);UsbDevice selected=null;
   for(UsbDevice d:manager.getDeviceList().values())if(d.getDeviceId()==value.getInt("deviceId")&&d.getVendorId()==value.getInt("vid")&&d.getProductId()==value.getInt("pid"))for(int i=0;i<d.getInterfaceCount();i++)if(d.getInterface(i).getId()==value.getInt("interface")&&d.getInterface(i).getInterfaceClass()==UsbConstants.USB_CLASS_PRINTER)selected=d;
   if(selected==null)throw new IllegalArgumentException();
   if(!manager.hasPermission(selected)){int flags=PendingIntent.FLAG_UPDATE_CURRENT;if(Build.VERSION.SDK_INT>=31)flags|=PendingIntent.FLAG_MUTABLE;manager.requestPermission(selected,PendingIntent.getBroadcast(context,2,new Intent(context.getPackageName()+".PRINTER_USB_PERMISSION").setPackage(context.getPackageName()),flags));permissionPending=true;}
  }
  profile=new JSONObject(value.toString());context.getSharedPreferences("peripherals",0).edit().putString("printer",profile.toString()).apply();return new JSONObject().put("configured",true).put("permissionPending",permissionPending).put("physicalCompatibilityVerified",false);
 }
 public JSONObject print(String data)throws Exception {
  if(profile==null)throw new IllegalStateException();byte[] bytes=Base64.decode(data,Base64.NO_WRAP);if(bytes.length>65536)throw new IllegalArgumentException();
  if(profile.getString("transport").equals("bluetooth")){
   BluetoothManager service=(BluetoothManager)context.getSystemService(Context.BLUETOOTH_SERVICE);if(service==null||service.getAdapter()==null)throw new IllegalStateException();BluetoothDevice d=service.getAdapter().getRemoteDevice(profile.getString("address"));try(BluetoothSocket socket=d.createRfcommSocketToServiceRecord(UUID.fromString("00001101-0000-1000-8000-00805F9B34FB"))){socket.connect();socket.getOutputStream().write(bytes);socket.getOutputStream().flush();}
  }else{
   UsbManager manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);UsbDevice device=null;for(UsbDevice d:manager.getDeviceList().values())if(d.getVendorId()==profile.getInt("vid")&&d.getProductId()==profile.getInt("pid"))device=d;if(device==null||!manager.hasPermission(device))throw new SecurityException();UsbDeviceConnection link=manager.openDevice(device);if(link==null)throw new IllegalStateException();
   try{boolean sent=false;for(int i=0;i<device.getInterfaceCount();i++){UsbInterface f=device.getInterface(i);if(f.getId()!=profile.getInt("interface")||f.getInterfaceClass()!=UsbConstants.USB_CLASS_PRINTER)continue;for(int j=0;j<f.getEndpointCount();j++){UsbEndpoint e=f.getEndpoint(j);if(e.getDirection()==UsbConstants.USB_DIR_OUT&&e.getType()==UsbConstants.USB_ENDPOINT_XFER_BULK&&link.claimInterface(f,true)){int at=0;while(at<bytes.length){int n=link.bulkTransfer(e,bytes,at,Math.min(4096,bytes.length-at),3000);if(n<=0)throw new IOException();at+=n;}link.releaseInterface(f);sent=true;}}}if(!sent)throw new IllegalStateException();}finally{link.close();}
  }return new JSONObject().put("sentToTransport",true).put("paperOutputVerified",false);
 }
}
