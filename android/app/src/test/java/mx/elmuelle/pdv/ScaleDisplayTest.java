package mx.elmuelle.pdv;
import org.junit.Test;import static org.junit.Assert.*;import java.nio.charset.StandardCharsets;
public class ScaleDisplayTest {
 private ScaleDecoder decoder(){return new ScaleDecoder("ascii-auto-safe","auto",40);}
 @Test public void showsFirstCompleteFrameWithoutAuthorizingSale(){ScaleDecoder d=decoder();ScaleDecoder.Reading r=d.feed("1.250 kg\r\n".getBytes(StandardCharsets.US_ASCII));assertFalse(r.valid);assertFalse(r.stable);assertTrue(ScaleDisplay.available(r,true,1000,1000));assertEquals(1.25,r.kg,0.0001);}
 @Test public void changingWeightRemainsVisibleButUnusable(){ScaleDecoder d=decoder();for(String line:new String[]{"US,GS,1.200 kg\r\n","US,GS,1.750 kg\r\n","US,GS,2.100 kg\r\n"}){ScaleDecoder.Reading r=d.feed(line.getBytes(StandardCharsets.US_ASCII));assertTrue(ScaleDisplay.available(r,true,2000,2000));assertFalse(r.valid);assertFalse(r.stable);}}
 @Test public void unknownNegativeAndOverloadNeverDisplay(){ScaleDecoder d=decoder();for(String line:new String[]{"TOTAL 1250\r\n","-1.200 kg\r\n","41 kg\r\n","OL\r\n"})assertFalse(ScaleDisplay.available(d.feed(line.getBytes(StandardCharsets.US_ASCII)),true,1000,1000));}
 @Test public void staleOrDisconnectedNeverDisplay(){ScaleDecoder.Reading r=decoder().feed("ST,GS,1.250 kg\r\n".getBytes(StandardCharsets.US_ASCII));assertFalse(ScaleDisplay.available(r,false,1000,1000));assertFalse(ScaleDisplay.available(r,true,2501,1000));assertFalse(ScaleDisplay.available(r,true,999,1000));}
 @Test public void separatorsCannotTurnAnOldFrameIntoAFreshOne(){ScaleDecoder d=decoder();ScaleDecoder.Reading r=d.feed("1.250 kg\r\n".getBytes(StandardCharsets.US_ASCII));long sequence=d.frameSequence();d.feed("\r\n\r\n".getBytes(StandardCharsets.US_ASCII));assertEquals(sequence,d.frameSequence());assertFalse(ScaleDisplay.available(r,true,2501,1000));}
}
