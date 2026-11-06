package mx.elmuelle.pdv;
import java.nio.charset.StandardCharsets;import java.util.*;
/** Bounded, opt-in technical trace. Unknown payloads are redacted, never logged. */
public final class ScaleTrace {
 public static final class Entry {public final long elapsedMs;public final int bytes;public final String direction,format,hex,ascii;public final boolean redacted;Entry(long ms,byte[] raw,String dir,String fmt,boolean safe){elapsedMs=ms;bytes=raw.length;direction=dir;format=fmt;redacted=!safe;StringBuilder h=new StringBuilder(),a=new StringBuilder();if(safe){for(byte b:raw){int c=b&255;if(h.length()>0)h.append(' ');h.append(String.format(Locale.ROOT,"%02X",c));if(c==13)a.append("\\r");else if(c==10)a.append("\\n");else if(c==2)a.append("<STX>");else if(c==3)a.append("<ETX>");else if(c>=32&&c<=126)a.append((char)c);else a.append('.');}}else{h.append("[payload omitido]");for(byte b:raw){int c=b&255;if(c==2||c==3||c==10||c==13){h.append(String.format(Locale.ROOT," %02X",c));if(h.length()>90)break;}}a.append("[trama desconocida: contenido omitido para no registrar datos ajenos al peso]");}hex=h.toString();ascii=a.toString();}}
 private final ArrayDeque<Entry> entries=new ArrayDeque<>();private long started,until;private int total,byteLimit=8192,entryLimit=32;
 public synchronized void start(long now){begin(now,20000,8192,32);}
 public synchronized void startAutomatic(long now){begin(now,60000,32768,128);}
 private void begin(long now,long window,int bytes,int count){entries.clear();total=0;started=now;until=now+window;byteLimit=bytes;entryLimit=count;}
 public synchronized void stop(){until=0;}
 public synchronized boolean capturing(long now){return until>0&&now<until&&total<byteLimit&&entries.size()<entryLimit;}
 public synchronized void add(long now,byte[] raw,String direction,String format,boolean weightOnly){if(!capturing(now)||raw.length==0)return;boolean safe=weightOnly&&raw.length<=128;byte[] bounded=Arrays.copyOf(raw,Math.min(128,raw.length));Entry e=new Entry(now-started,bounded,direction,format,safe);if(total+e.hex.length()+e.ascii.length()>byteLimit){until=0;return;}total+=e.hex.length()+e.ascii.length();entries.add(e);}
 public synchronized List<Entry> snapshot(){return new ArrayList<>(entries);}
}
