package mx.elmuelle.pdv;

import java.util.*;

/** Pure policy: bounded local discovery and fail-closed USB identity selection. */
public final class PeripheralPolicy {
 public record UsbIdentity(int id,int vid,int pid,int iface,String serial){}
 public static int selectUsb(List<UsbIdentity> devices,int vid,int pid,int iface,String serial,int explicitSessionId){
  List<UsbIdentity> matches=new ArrayList<>();
  for(UsbIdentity d:devices)if(d.vid==vid&&d.pid==pid&&d.iface==iface&&(serial==null||serial.isEmpty()||serial.equals(d.serial)))matches.add(d);
  if(matches.size()==1)return matches.get(0).id;
  if(serial==null||serial.isEmpty())for(UsbIdentity d:matches)if(d.id==explicitSessionId)return d.id;
  return -1;
 }
 private static long ip(String address){
  PrinterNetworkPolicy.validate(address,9100);long value=0;
  for(String part:address.split("\\."))value=(value<<8)|Integer.parseInt(part);
  return value;
 }
 private static String address(long value){return ((value>>24)&255)+"."+((value>>16)&255)+"."+((value>>8)&255)+"."+(value&255);}
 public static List<String> localTargets(String own,int prefix,Set<String> excluded){
  long value=ip(own);if(prefix<1||prefix>32)throw new IllegalArgumentException("Prefijo inválido");
  if(prefix>=31)return List.of();
  // Never sweep a /8 or /16: inspect only the tablet's /24 within its real subnet.
  int bounded=Math.max(24,prefix);long mask=(0xffffffffL<<(32-bounded))&0xffffffffL;
  long network=value&mask,broadcast=network|(~mask&0xffffffffL);List<String> out=new ArrayList<>();
  for(long candidate=network+1;candidate<broadcast;candidate++){String host=address(candidate);if(candidate!=value&&!excluded.contains(host))out.add(host);}
  return out;
 }
 public static boolean candidateFresh(String foundNetwork,String currentNetwork,long foundAt,long now){return foundAt>0&&now>=foundAt&&now-foundAt<120000&&foundNetwork!=null&&!foundNetwork.isEmpty()&&foundNetwork.equals(currentNetwork);}
 public static boolean discoveryDue(String lastScope,String currentScope,long lastAttempt,long now){return lastAttempt<0||!Objects.equals(lastScope,currentScope)||(now>=lastAttempt&&now-lastAttempt>=120000);}
 private PeripheralPolicy(){}
}
