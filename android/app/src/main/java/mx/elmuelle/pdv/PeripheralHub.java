package mx.elmuelle.pdv;

import android.content.*;
import android.content.pm.PackageManager;
import android.hardware.usb.*;
import android.net.*;
import android.os.Build;
import org.json.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/** Non-blocking peripheral inventory. Discovery never prints or guesses protocols. */
public final class PeripheralHub {
 private final Context context;private final PrinterHost printers;private final UsbScaleHost scales;
 private final ScheduledExecutorService maintenance=Executors.newSingleThreadScheduledExecutor();
 private final ExecutorService discovery=Executors.newSingleThreadExecutor();
 private final AtomicBoolean busy=new AtomicBoolean();private volatile boolean foreground,automatic;
 private final AtomicInteger generation=new AtomicInteger();private volatile int checked,total;private volatile String discoveryMessage="Abre la búsqueda para encontrar equipos de esta red.";
 private volatile long foundAt,lastProbe;private volatile String foundNetwork="",lastProfile="",lastNetwork="",lanMessage="";
 private volatile boolean lanAvailable;private final Map<String,JSONObject> lan=new LinkedHashMap<>();
 private volatile long lastAutomaticSearch=-1;private volatile String automaticSearchScope="";
 private record Scope(Network network,String host,int prefix,List<String> targets,String gateway){String key(){return network.toString()+"/"+host+"/"+prefix;}}
 PeripheralHub(Context context,PrinterHost printers,UsbScaleHost scales){
  this.context=context;this.printers=printers;this.scales=scales;automatic=context.getSharedPreferences("peripherals",0).getBoolean("automaticReconnect",true);
  maintenance.scheduleWithFixedDelay(this::maintain,0,5,TimeUnit.SECONDS);
 }
 void foreground(boolean value){foreground=value;if(!value){generation.incrementAndGet();}else maintenance.execute(this::maintain);}
 private Scope scope()throws Exception{
  ConnectivityManager manager=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);Network network=manager.getActiveNetwork();
  if(network==null)throw new IllegalStateException("Conecta la tablet al Wi-Fi o Ethernet del local.");
  NetworkCapabilities caps=manager.getNetworkCapabilities(network);LinkProperties links=manager.getLinkProperties(network);
  if(caps==null||links==null||caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)||!(caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)||caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)))throw new IllegalStateException("La búsqueda requiere Wi-Fi/Ethernet local sin VPN; no se busca en internet.");
  Set<String> excluded=new HashSet<>();for(RouteInfo route:links.getRoutes())if(route.isDefaultRoute()&&route.getGateway()!=null)excluded.add(route.getGateway().getHostAddress());
  for(LinkAddress address:links.getLinkAddresses())if(address.getAddress() instanceof Inet4Address){String host=address.getAddress().getHostAddress();try{String gateway="";for(String candidate:excluded)try{PrinterNetworkPolicy.validate(candidate,9100);gateway=candidate;break;}catch(IllegalArgumentException ignored){}return new Scope(network,host,address.getPrefixLength(),PeripheralPolicy.localTargets(host,address.getPrefixLength(),excluded),gateway);}catch(IllegalArgumentException ignored){}}
  throw new IllegalStateException("La red no tiene una dirección IPv4 privada compatible.");
 }
 private void maintain(){maintain(false);}
 private void maintain(boolean forced){
  if(!foreground||(!automatic&&!forced))return;
  try{
   printers.reconnectRemembered();JSONObject profile=printers.profileSnapshot();if(profile==null||!profile.optString("transport").equals("lan"))return;
   Scope scope=scope();String signature=profile.toString();long now=android.os.SystemClock.elapsedRealtime();
   if(!forced&&signature.equals(lastProfile)&&scope.key().equals(lastNetwork)&&now-lastProbe<30000)return;
   lastProfile=signature;lastNetwork=scope.key();lastProbe=now;
   String host=profile.getString("host");
   // A remembered private address outside this actual subnet is never probed.
   boolean inSubnet=sameSubnet(scope.host,host,scope.prefix);
   boolean available=inSubnet&&LocalPrinterProbe.available(host,profile.getInt("port"),()->scope.network.getSocketFactory().createSocket());
   if(!foreground)return;lanAvailable=available;lanMessage=available?"Conexión LAN disponible. Se reutiliza al imprimir.":inSubnet?"La IP guardada no responde. Buscando equipos para que puedas elegir la impresora.":"Cambió la red. Buscando equipos de esta red; elige tu impresora.";
   if(!available&&automatic&&!busy.get()&&PeripheralPolicy.discoveryDue(automaticSearchScope,scope.key()+"/"+signature,lastAutomaticSearch,now)){automaticSearchScope=scope.key()+"/"+signature;lastAutomaticSearch=now;discover();}
  }catch(Exception error){lanAvailable=false;lanMessage=message(error);}
 }
 private boolean sameSubnet(String own,String candidate,int prefix){
  try{PrinterNetworkPolicy.validate(candidate,9100);byte[] a=InetAddress.getByName(own).getAddress(),b=InetAddress.getByName(candidate).getAddress();for(int i=0;i<prefix;i++)if((a[i/8]&(1<<(7-i%8)))!=(b[i/8]&(1<<(7-i%8))))return false;return true;}catch(Exception invalid){return false;}
 }
 JSONObject automatic(boolean enabled)throws Exception{
  automatic=enabled;context.getSharedPreferences("peripherals",0).edit().putBoolean("automaticReconnect",enabled).apply();if(enabled)maintenance.execute(this::maintain);return state();
 }
 JSONObject reconnect()throws Exception{if(!foreground)throw new IllegalStateException("Abre la aplicación para conectar equipos.");maintenance.execute(()->maintain(true));return state();}
 JSONObject discover()throws Exception{
  if(!foreground)throw new IllegalStateException("Abre la aplicación para buscar equipos.");
  if(!busy.compareAndSet(false,true))return state();
  final int expected=generation.incrementAndGet();checked=total=0;discoveryMessage="Buscando USB, Bluetooth emparejado y candidatos LAN…";
  synchronized(lan){lan.clear();foundAt=0;foundNetwork="";}
  discovery.execute(()->{
   ExecutorService workers=Executors.newFixedThreadPool(8);
   try{
    Scope scope=scope();total=scope.targets.size();List<Future<String>> futures=new ArrayList<>();
    for(String host:scope.targets)futures.add(workers.submit(()->{if(!foreground||generation.get()!=expected)return null;try{return LocalPrinterProbe.available(host,9100,()->scope.network.getSocketFactory().createSocket())?host:null;}finally{ synchronized(busy){checked++;} }}));
    long deadline=android.os.SystemClock.elapsedRealtime()+15000;
    for(Future<String> future:futures){if(!foreground||generation.get()!=expected)break;long remaining=deadline-android.os.SystemClock.elapsedRealtime();if(remaining<=0)throw new TimeoutException();String host=future.get(remaining,TimeUnit.MILLISECONDS);if(host!=null)synchronized(lan){lan.put("lan:"+host,new JSONObject().put("id","lan:"+host).put("kind","printer").put("transport","lan").put("name","Candidato de impresión · "+host).put("host",host).put("port",9100).put("selectable",true).put("message","Puerto 9100 disponible. Confirma que es tu impresora; no se identificó el modelo."));}}
    if(generation.get()==expected&&foreground&&scope.key().equals(scope().key())){foundNetwork=scope.key();foundAt=android.os.SystemClock.elapsedRealtime();discoveryMessage="Búsqueda terminada. Elige un equipo nuevo una vez; los recordados se reutilizan."+(scope.prefix<24?" Se revisó sólo el segmento /24 de la tablet; otras IP se configuran manualmente.":"");}else{ synchronized(lan){lan.clear();}discoveryMessage="Cambió la red o se cerró la app; repite la búsqueda.";}
   }catch(Exception error){synchronized(lan){lan.clear();}discoveryMessage=message(error);}finally{workers.shutdownNow();busy.set(false);}
  });return state();
 }
 private JSONArray inventory()throws Exception{
  JSONArray out=new JSONArray();Set<Integer> printerIds=new HashSet<>();JSONArray detected=printers.devices();
  for(int i=0;i<detected.length();i++){
   JSONObject device=detected.getJSONObject(i),copy=new JSONObject(device.toString());String transport=device.getString("transport");
   if(transport.equals("usb")){printerIds.add(device.getInt("deviceId"));copy.put("id","usb:"+device.getInt("vid")+":"+device.getInt("pid")+":"+device.getInt("deviceId")+":"+device.getInt("interface")).put("kind","printer").put("message","Interfaz de impresora USB; confirma compatibilidad ESC/POS en papel.");}
   else copy.put("id","bluetooth:"+device.getString("address")).put("kind","bluetooth").put("message","Equipo emparejado; elige como impresora sólo si es ESC/POS. Lectores/teclados se gestionan por Android.");
   copy.put("selectable",true);out.put(copy);
  }
  UsbManager manager=(UsbManager)context.getSystemService(Context.USB_SERVICE);
  for(UsbDevice device:manager.getDeviceList().values())if(!printerIds.contains(device.getDeviceId())){
   boolean approved=ScaleSerialPolicy.approvedBar9Transport(device.getVendorId(),device.getProductId());
   out.put(new JSONObject().put("id","scale:"+device.getDeviceId()).put("kind",approved?"scale":"usb").put("transport","usb").put("deviceId",device.getDeviceId()).put("vid",device.getVendorId()).put("pid",device.getProductId()).put("name",approved?"Transporte del perfil RHINO BAR-9":"USB · "+Objects.toString(device.getProductName(),"equipo sin identificar")).put("selectable",approved).put("message",approved?"Usa exclusivamente el perfil aprobado; no cambia tara ni calibración.":"No se envían comandos. Si es una báscula diferente, requiere revisar su perfil."));
  }
  boolean sameNetwork=false;try{if(foundAt>0)sameNetwork=PeripheralPolicy.candidateFresh(foundNetwork,scope().key(),foundAt,android.os.SystemClock.elapsedRealtime());}catch(Exception unavailable){}
  synchronized(lan){if(sameNetwork)for(JSONObject value:lan.values())out.put(new JSONObject(value.toString()));}
  return out;
 }
 JSONObject connect(String id)throws Exception{
  if(id==null||id.length()>180)throw new IllegalArgumentException("Equipo inválido");
  JSONArray devices=inventory();JSONObject selected=null;for(int i=0;i<devices.length();i++)if(id.equals(devices.getJSONObject(i).getString("id")))selected=devices.getJSONObject(i);
  if(selected==null||!selected.optBoolean("selectable"))throw new IllegalStateException("El equipo ya no está disponible; actualiza la búsqueda.");
  if(selected.optString("transport").equals("lan")&&!foundNetwork.equals(scope().key()))throw new IllegalStateException("Cambió la red; vuelve a buscar la impresora.");
  if(selected.getString("kind").equals("scale")){JSONObject state=scales.state();if(state.optBoolean("connected")&&state.optJSONObject("profile")!=null&&state.getJSONObject("profile").optInt("deviceId")==selected.getInt("deviceId"))return new JSONObject().put("alreadyConnected",true);return scales.open(selected);}
  selected.put("protocol","escpos");JSONObject result=printers.configure(selected);lastProbe=0;maintenance.execute(this::maintain);return result;
 }
 JSONObject state()throws Exception{
  JSONObject printer=printers.status();if(printer.optJSONObject("profile")!=null&&printer.getJSONObject("profile").optString("transport").equals("lan")){boolean checkedProfile=printer.getJSONObject("profile").toString().equals(lastProfile);printer.put("available",checkedProfile&&lanAvailable).put("message",!automatic?"Comprobación automática desactivada; la conexión se conserva.":!checkedProfile||lanMessage.isEmpty()?"Comprobación LAN pendiente.":lanMessage);}
  JSONObject network=new JSONObject();try{Scope scope=scope();network.put("available",true).put("address",scope.host).put("gateway",scope.gateway).put("prefix",scope.prefix);}catch(Exception unavailable){network.put("available",false).put("message",message(unavailable));}
  JSONObject scale=scales.state();return new JSONObject().put("automaticPrinter",automatic).put("searching",busy.get()).put("checked",checked).put("total",total).put("discoveryMessage",discoveryMessage).put("devices",inventory()).put("network",network).put("printer",printer).put("scale",new JSONObject().put("connected",scale.optBoolean("connected")).put("valid",scale.optBoolean("valid")).put("message",scale.optString("message"))).put("bluetoothPermissionRequired",Build.VERSION.SDK_INT>=31&&context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT)!=PackageManager.PERMISSION_GRANTED).put("physicalCompatibilityVerified",false);
 }
 private String message(Exception error){return error instanceof IllegalStateException?error.getMessage():"No se pudo completar la búsqueda local. Revisa la red y los permisos de Android.";}
}
