package mx.elmuelle.pdv;
import org.junit.Test;import static org.junit.Assert.*;import java.nio.charset.StandardCharsets;
public class ScaleDecoderTest {
 private ScaleDecoder.Reading read(ScaleDecoder d,String s){return d.feed(s.getBytes(StandardCharsets.US_ASCII));}
 @Test public void stableKilograms(){ScaleDecoder d=new ScaleDecoder("ascii-st-us","kg",1000);ScaleDecoder.Reading r=read(d,"ST,GS,+001.250 kg\r\n");assertTrue(r.valid);assertEquals(1.25,r.kg,0.00001);}
 @Test public void unitsAndNegatives(){ScaleDecoder d=new ScaleDecoder("ascii-st-us","g",100);assertEquals(1.5,read(d,"ST 1500 g\n").kg,0.0001);assertFalse(read(d,"ST -1500 g\n").valid);assertFalse(read(d,"ST 1 kg\n").valid);}
 @Test public void unstableNeverValid(){ScaleDecoder d=new ScaleDecoder("ascii-st-us","kg",100);assertFalse(read(d,"US 1.25 kg\n").valid);assertFalse(read(d,"OVERLOAD\n").valid);assertFalse(read(d,"12:30 1.25 kg\n").valid);assertFalse(read(d,"unknown 1.25\n").valid);}
 @Test public void fragmentedFrames(){ScaleDecoder d=new ScaleDecoder("ascii-st-us","kg",100);assertFalse(read(d,"ST 1.").valid);assertTrue(read(d,"25 kg\n").valid);assertFalse(read(d,"US 0.3 kg\n").valid);}
 @Test public void invalidAndDisconnectClearWeight(){ScaleDecoder d=new ScaleDecoder("ascii-st-us","kg",100);assertTrue(read(d,"ST 2 kg\n").valid);assertFalse(d.feed(new byte[]{0,1,2,10}).valid);assertTrue(read(d,"ST 2 kg\n").valid);d.disconnect();assertFalse(d.feed(new byte[0]).valid);}
 @Test public void bounds(){ScaleDecoder d=new ScaleDecoder("ascii-st-us","kg",30);assertFalse(read(d,"ST 31 kg\n").valid);assertFalse(read(d,"ST NaN kg\n").valid);assertFalse(read(d,"ST 1.111111 kg\n").valid);assertTrue(read(d,"ST 0 kg\n").valid);}
 @Test public void hidKnownStableReport(){ScaleDecoder d=new ScaleDecoder("hid-pos-scale","kg",100);ScaleDecoder.Reading r=d.feed(new byte[]{3,4,3,-3,(byte)0xe2,4});assertTrue(r.valid);assertEquals(1.25,r.kg,0.0001);assertFalse(d.feed(new byte[]{3,3,3,-3,1,0}).valid);assertFalse(d.feed(new byte[]{0,4,3,-3,1,0}).valid);assertFalse(d.feed(new byte[]{3,4,3,-3,1}).valid);}
 @Test(expected=IllegalArgumentException.class) public void unknownProtocolRejected(){new ScaleDecoder("universal","kg",100);}
 @Test public void explicitUnitRequiresThreeEqualFrames(){ScaleDecoder d=new ScaleDecoder("ascii-explicit-unit","kg",100);assertFalse(read(d,"1.25 kg\n").valid);assertFalse(read(d,"1.25 kg\n").valid);assertTrue(read(d,"1.25 kg\n").valid);assertFalse(read(d,"unknown\n").valid);assertFalse(read(d,"1.25 kg\n").valid);}
 @Test public void partialNewFrameInvalidatesPreviousWeight(){ScaleDecoder d=new ScaleDecoder("ascii-st-us","kg",100);assertTrue(read(d,"ST 2 kg\n").valid);assertFalse(read(d,"ST 1").valid);assertTrue(read(d," kg\n").valid);}
 @Test public void unknownBytesInvalidateEntireFrame(){ScaleDecoder d=new ScaleDecoder("ascii-st-us","kg",100);assertFalse(read(d,"\u0000ST 2 kg\n").valid);assertTrue(read(d,"ST 2 kg\n").valid);assertFalse(read(d,"ST 2\u0001ST 1 kg\n").valid);}
 @Test public void longFrameIsNotReinterpretedAsValidTail(){ScaleDecoder d=new ScaleDecoder("ascii-st-us","kg",100);StringBuilder b=new StringBuilder();for(int i=0;i<121;i++)b.append(' ');assertFalse(read(d,b+"ST 2 kg\n").valid);assertTrue(read(d,"ST 2 kg\n").valid);}
}
