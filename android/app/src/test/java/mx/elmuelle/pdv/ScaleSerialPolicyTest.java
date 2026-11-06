package mx.elmuelle.pdv;
import org.junit.Test;import static org.junit.Assert.*;import java.nio.charset.StandardCharsets;import java.util.*;import com.hoho.android.usbserial.driver.*;
public class ScaleSerialPolicyTest {
 @Test public void bundledDriverAdvertisesObservedChip(){int[] ids=Ch34xSerialDriver.getSupportedDevices().get(0x1a86);assertNotNull(ids);assertTrue(Arrays.stream(ids).anyMatch(n->n==0x7523));assertTrue(ScaleSerialPolicy.isCh34x(6790,29987));assertFalse(ScaleSerialPolicy.isCh34x(0x0403,0x7523));}
 @Test public void legacyOrUnconfirmedCommandsNeverTransmit(){assertEquals(0,ScaleSerialPolicy.command("P",false).length);assertEquals(0,ScaleSerialPolicy.command("unknown",false).length);assertEquals(0,ScaleSerialPolicy.command("",true).length);}
 @Test public void onlyExplicitlyConfirmedKnownCommandsAreAllowed(){assertArrayEquals("P\r\n".getBytes(StandardCharsets.US_ASCII),ScaleSerialPolicy.command("P\r\n",true));try{ScaleSerialPolicy.command("RESET",true);fail();}catch(IllegalArgumentException expected){}}
 @Test public void validityExpiresAndRejectsClockRollback(){assertTrue(ScaleSerialPolicy.fresh(1500,0));assertFalse(ScaleSerialPolicy.fresh(1501,0));assertFalse(ScaleSerialPolicy.fresh(0,-1));assertFalse(ScaleSerialPolicy.fresh(99,100));}
}
