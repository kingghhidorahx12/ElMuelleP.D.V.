package mx.elmuelle.pdv;
import org.junit.Test;import static org.junit.Assert.*;import java.nio.charset.StandardCharsets;
public class ScaleTraceTest {
 private byte[] bytes(String value){return value.getBytes(StandardCharsets.US_ASCII);}
 @Test public void captureIsOptInAndExpires(){ScaleTrace t=new ScaleTrace();t.add(10,bytes("ST 1kg\r"),"RX","ascii-st-us",true);assertEquals(0,t.snapshot().size());t.start(100);t.add(101,bytes("ST 1kg\r"),"RX","ascii-st-us",true);assertEquals(1,t.snapshot().size());t.add(20100,bytes("ST 2kg\r"),"RX","ascii-st-us",true);assertEquals(1,t.snapshot().size());}
 @Test public void unknownOrLongPayloadsAreRedacted(){ScaleTrace t=new ScaleTrace();t.start(0);t.add(1,bytes("synthetic-private 12345\r"),"RX","unknown",false);assertTrue(t.snapshot().get(0).redacted);assertFalse(t.snapshot().get(0).hex.contains("73 79 6E"));assertFalse(t.snapshot().get(0).ascii.contains("12345"));t.add(2,new byte[300],"RX","unknown",true);assertTrue(t.snapshot().get(1).redacted);}
 @Test public void traceHasHardMemoryBoundsAndResetsForNewCapture(){ScaleTrace t=new ScaleTrace();t.start(0);for(int n=0;n<1000;n++)t.add(n,bytes("ST 1.250kg\r"),"RX","ascii-st-us",true);assertTrue(t.snapshot().size()<=32);t.start(2000);assertEquals(0,t.snapshot().size());t.stop();assertFalse(t.capturing(2001));}
}
