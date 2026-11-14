package mx.elmuelle.pdv;
import org.junit.Test;import static org.junit.Assert.*;import java.util.*;import java.net.*;import java.io.*;
public class PeripheralPolicyTest {
 private PeripheralPolicy.UsbIdentity usb(int id,String serial){return new PeripheralPolicy.UsbIdentity(id,123,456,1,serial);}
 private int select(List<PeripheralPolicy.UsbIdentity> devices,String serial,int session){return PeripheralPolicy.selectUsb(devices,123,456,1,serial,session);}
 @Test public void savedUsbCanChangeDeviceId(){assertEquals(18,select(List.of(usb(18,"")),"",-1));}
 @Test public void identicalDevicesNeverUseStaleAndroidId(){assertEquals(-1,select(List.of(usb(1,""),usb(2,"")),"",-1));}
 @Test public void exactSerialSurvivesEnumerationChanges(){assertEquals(20,select(List.of(usb(20,"printer-a"),usb(21,"printer-b")),"printer-a",-1));}
 @Test public void wrongSerialIsNotTheRememberedPrinter(){assertEquals(-1,select(List.of(usb(1,"different")),"printer-a",1));}
 @Test public void explicitChoiceIsOnlyForThisAttachmentSession(){assertEquals(2,select(List.of(usb(1,""),usb(2,"")),"",2));assertEquals(-1,select(List.of(usb(1,""),usb(2,"")),"",-1));}
 @Test public void differentInterfaceIsNeverSelected(){assertEquals(-1,select(List.of(new PeripheralPolicy.UsbIdentity(1,123,456,2,"")),"",1));}
 @Test public void duplicateSerialsAreAmbiguous(){assertEquals(-1,select(List.of(usb(1,"a"),usb(2,"a")),"a",1));}
 @Test public void subnetExcludesSelfGatewayNetworkBroadcast(){List<String> targets=PeripheralPolicy.localTargets("192.168.1.3",24,Set.of("192.168.1.1"));assertEquals(252,targets.size());assertTrue(targets.contains("192.168.1.100"));for(String host:List.of("192.168.1.0","192.168.1.1","192.168.1.3","192.168.1.255"))assertFalse(targets.contains(host));}
 @Test public void hugeSubnetsAreCapped(){List<String> targets=PeripheralPolicy.localTargets("10.20.30.4",8,Set.of());assertEquals(253,targets.size());assertTrue(targets.stream().allMatch(s->s.startsWith("10.20.30.")));}
 @Test public void smallSubnetsDoNotEscapeTheirActualRange(){assertEquals(List.of("172.16.4.6"),PeripheralPolicy.localTargets("172.16.4.5",30,Set.of()));assertEquals(List.of(),PeripheralPolicy.localTargets("192.168.1.3",32,Set.of()));}
 @Test public void publicAddressesAndInvalidPrefixesRejected(){for(String host:List.of("8.8.8.8","127.0.0.1","192.168.01.1")){try{PeripheralPolicy.localTargets(host,24,Set.of());fail(host);}catch(IllegalArgumentException expected){}}for(int prefix:new int[]{0,33}){try{PeripheralPolicy.localTargets("10.0.0.2",prefix,Set.of());fail();}catch(IllegalArgumentException expected){}}}
 @Test public void detectionHasNoPayloadAndAlwaysCloses(){boolean[] closed={false};assertTrue(LocalPrinterProbe.available("192.168.1.9",9100,()->new Socket(){public void connect(SocketAddress address,int timeout){assertEquals(350,timeout);assertEquals(9100,((InetSocketAddress)address).getPort());}public OutputStream getOutputStream(){throw new AssertionError("Detection must not send commands");}public synchronized void close(){closed[0]=true;}}));assertTrue(closed[0]);}
 @Test public void failedProbeIsNotAConnection(){boolean[] closed={false};assertFalse(LocalPrinterProbe.available("10.0.0.4",9100,()->new Socket(){public void connect(SocketAddress address,int timeout)throws IOException{throw new SocketTimeoutException();}public synchronized void close(){closed[0]=true;}}));assertTrue(closed[0]);}
 @Test public void candidatesBelongToTheNetworkThatWasSearched(){assertTrue(PeripheralPolicy.candidateFresh("wifi-a","wifi-a",100,101));assertFalse(PeripheralPolicy.candidateFresh("wifi-a","wifi-b",100,101));}
 @Test public void oldOrFutureCandidatesCannotBeConnected(){assertFalse(PeripheralPolicy.candidateFresh("a","a",100,120100));assertFalse(PeripheralPolicy.candidateFresh("a","a",100,99));assertFalse(PeripheralPolicy.candidateFresh("a","a",0,1));}
 @Test public void missingPrinterDiscoveryIsBoundedByScopeAndTime(){assertTrue(PeripheralPolicy.discoveryDue("","wifi/profile",-1,100));assertFalse(PeripheralPolicy.discoveryDue("wifi/profile","wifi/profile",100,119999));assertTrue(PeripheralPolicy.discoveryDue("wifi/profile","wifi/profile",100,120100));assertTrue(PeripheralPolicy.discoveryDue("wifi/profile","other/profile",100,101));assertFalse(PeripheralPolicy.discoveryDue("a","a",100,99));}
}
