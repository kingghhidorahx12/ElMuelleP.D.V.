package mx.elmuelle.pdv;
import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class ScaleAutoSessionTest {
 private ScaleDecoder.Reading feed(ScaleAutoSession s,ScaleDecoder d,long time,String text){byte[] bytes=text.getBytes(StandardCharsets.US_ASCII);s.bytes(time,bytes.length);ScaleDecoder.Reading r=d.feed(bytes);s.reading(r.code,r.valid,r.stable);return r;}
 @Test public void readerOpensBeforeFirstPAndPollsEvery800ms(){
  ScaleAutoSession s=new ScaleAutoSession(null);assertEquals(ScaleAutoSession.Action.OPEN,s.tick(0));assertEquals(ScaleAutoSession.Action.NONE,s.tick(0));s.opened(100);
  assertEquals(ScaleAutoSession.Action.POLL,s.tick(100));assertEquals(ScaleAutoSession.Action.NONE,s.tick(899));assertEquals(ScaleAutoSession.Action.POLL,s.tick(900));assertArrayEquals(new byte[]{0x50},ScaleSerialPolicy.windowsBar9Command());
 }
 @Test public void noDataExhaustsExactlySixTransportAttemptsAndStops(){
  ScaleAutoSession s=new ScaleAutoSession(null);int opens=0,polls=0,failures=0;Set<String> transport=new HashSet<>();
  for(long time=0;time<40000;time+=100){switch(s.tick(time)){case OPEN:opens++;transport.add(s.attempt().id());s.opened(time);break;case POLL:polls++;break;case FAILED:failures++;break;default:break;}}
  assertEquals(6,opens);assertEquals(6,transport.size());assertTrue(polls>0&&polls<=30);assertEquals(1,failures);assertEquals("NO_DATA_AFTER_WINDOWS_P",s.failure());assertEquals(ScaleAutoSession.Action.NONE,s.tick(100000));
 }
 @Test public void anyReceivedBytesPreventElectricalGuessing(){
  ScaleAutoSession s=new ScaleAutoSession(null);s.tick(0);s.opened(0);s.bytes(100,10);s.reading("FORMAT_UNKNOWN",false,false);
  for(long t=100;t<8100;t+=100)assertNotEquals(ScaleAutoSession.Action.OPEN,s.tick(t));
  assertEquals(ScaleAutoSession.Action.FAILED,s.tick(8100));assertEquals("FORMAT_UNKNOWN",s.failure());assertEquals(1,s.attemptNumber());
 }
 @Test public void recognizedFragmentedFrameSelectsAvailableWithoutOtherAttempts(){
  ScaleAutoSession s=new ScaleAutoSession(null);ScaleDecoder d=new ScaleDecoder("ascii-auto-safe","auto",40);s.tick(0);s.opened(0);
  assertFalse(feed(s,d,100,"ST,GS,+001.").valid);assertTrue(feed(s,d,200,"250 kg\r\n").valid);assertEquals("AVAILABLE",s.phase());assertEquals("kg",d.reportedUnit());assertEquals(1.25,d.current().kg,.00001);
  for(long t=1000;t<20000;t+=800)assertNotEquals(ScaleAutoSession.Action.OPEN,s.tick(t));assertEquals(1,s.attemptNumber());
 }
 @Test public void unitDetectionConvertsExplicitGramsAndPounds(){
  for(String frame:new String[]{"ST 1250g\r","ST 2.755778lb\r"}){
   // Precision policy allows four decimals, so use an actual supported wire value below.
   String wire=frame.contains("lb")?"ST 2.7558lb\r":frame;
   ScaleAutoSession s=new ScaleAutoSession(null);ScaleDecoder d=new ScaleDecoder("ascii-auto-safe","auto",40);s.tick(0);s.opened(0);
   assertTrue(feed(s,d,100,wire).valid);assertEquals(1.25,d.current().kg,.001);assertEquals("AVAILABLE",s.phase());
  }
 }
 @Test public void unitlessOrPriceColumnsNeverBecomeAnAvailableWeight(){
  for(String text:new String[]{"001.250\r","1.250kg 25.00 31.25\r","ST 1oz\r","ST 41kg\r","ST -1kg\r"}){
   ScaleAutoSession s=new ScaleAutoSession(null);ScaleDecoder d=new ScaleDecoder("ascii-auto-safe","auto",40);s.tick(0);s.opened(0);for(int n=0;n<3;n++)assertFalse(feed(s,d,100+n*800,text).valid);assertNotEquals("AVAILABLE",s.phase());
  }
 }
 @Test public void plainUnitRequiresThreeConsecutiveObservations(){
  ScaleAutoSession s=new ScaleAutoSession(null);ScaleDecoder d=new ScaleDecoder("ascii-auto-safe","auto",40);s.tick(0);s.opened(0);
  assertFalse(feed(s,d,100,"1.250kg\r").valid);assertFalse(feed(s,d,900,"1.250kg\r").valid);assertTrue(feed(s,d,1700,"1.250kg\r").valid);assertEquals("AVAILABLE",s.phase());
 }
 @Test public void unstableAndInvalidResponsesHaveSpecificFailure(){
  ScaleAutoSession s=new ScaleAutoSession(null);ScaleDecoder d=new ScaleDecoder("ascii-auto-safe","auto",40);s.tick(0);s.opened(0);
  for(int n=0;n<10;n++)assertFalse(feed(s,d,100+n*800,"US 1kg\r").valid);
  assertEquals(ScaleAutoSession.Action.FAILED,s.tick(8100));assertEquals("UNSTABLE_WEIGHT",s.failure());
 }
 @Test public void openReadAndWriteFailuresAreBounded(){
  for(String code:new String[]{"USB_OPEN_FAILED","USB_READ_FAILED","USB_WRITE_FAILED","CONTROL_LINES_FAILED"}){
   ScaleAutoSession s=new ScaleAutoSession(null);int attempts=0;
   for(long t=0;t<10000;t+=200){if(s.tick(t)==ScaleAutoSession.Action.OPEN){attempts++;s.transportFailed(t,code);}}
   assertEquals(6,attempts);assertEquals("INCOMPATIBLE",s.phase());assertEquals(code,s.failure());
  }
 }
 @Test public void validatedTransportIsPreferredAndFallbacksAreDeduplicated(){
  ScaleAutoSession.Attempt preferred=new ScaleAutoSession.Attempt(true,false,1000);ScaleAutoSession s=new ScaleAutoSession(preferred);assertEquals(preferred.id(),s.attempt().id());assertEquals(6,s.attemptLimit());
  assertEquals(6,new ScaleAutoSession(new ScaleAutoSession.Attempt(null,null,250)).attemptLimit());
 }
 @Test public void reconnectStartsWithNoOldWeightOrStability(){
  ScaleAutoSession s=new ScaleAutoSession(null);ScaleDecoder d=new ScaleDecoder("ascii-auto-safe","auto",40);s.tick(0);s.opened(0);assertTrue(feed(s,d,100,"ST 1kg\r").valid);d.disconnect();
  ScaleAutoSession reconnected=new ScaleAutoSession(s.attempt());assertFalse(d.current().valid);assertEquals("",d.reportedUnit());assertEquals(ScaleAutoSession.Action.OPEN,reconnected.tick(1000));reconnected.opened(1000);assertFalse(feed(reconnected,d,1100,"2kg\r").valid);assertFalse(ScaleSerialPolicy.fresh(2000,100));
 }
 @Test public void automaticTraceIncludesTxRxAndRedactsUnknownData(){
  ScaleTrace t=new ScaleTrace();t.startAutomatic(0);t.add(100,ScaleSerialPolicy.windowsBar9Command(),"TX","windows-bar9-P",true);t.add(200,"private invalid payload\r".getBytes(StandardCharsets.US_ASCII),"RX","unknown",false);
  assertEquals("50",t.snapshot().get(0).hex);assertEquals("P",t.snapshot().get(0).ascii);assertTrue(t.snapshot().get(1).redacted);assertFalse(t.snapshot().get(1).ascii.contains("private invalid"));
  for(int n=0;n<200;n++)t.add(1000+n,new byte[]{0x50},"TX","windows-bar9-P",true);assertTrue(t.snapshot().size()<=128);assertFalse(t.capturing(60000));
 }
 @Test public void aUnitChangeResetsPlainFrameStability(){
  ScaleDecoder d=new ScaleDecoder("ascii-auto-safe","auto",40);assertFalse(d.feed("1kg\r1kg\r".getBytes(StandardCharsets.US_ASCII)).valid);assertFalse(d.feed("1000g\r".getBytes(StandardCharsets.US_ASCII)).valid);assertFalse(d.feed("1000g\r".getBytes(StandardCharsets.US_ASCII)).valid);assertTrue(d.feed("1000g\r".getBytes(StandardCharsets.US_ASCII)).valid);
 }
 @Test public void automaticWindowsPIsRestrictedToTheApprovedTransport(){assertTrue(ScaleSerialPolicy.approvedBar9Transport(6790,29987));assertFalse(ScaleSerialPolicy.approvedBar9Transport(0x1a86,0x5523));assertFalse(ScaleSerialPolicy.approvedBar9Transport(0x0403,0x6001));}
}
