package mx.elmuelle.pdv;

import java.util.ArrayList;
import java.util.List;

/** Bounded BAR-9 transport discovery. It never changes baud, units or scale settings. */
public final class ScaleAutoSession {
 public enum Action { NONE, OPEN, POLL, FAILED }
 public static final long POLL_MS=800, FAST_POLL_MS=200, RESPONSE_TIMEOUT_MS=800, ATTEMPT_MS=4000, FRAME_WAIT_MS=8000;
 public static final class Attempt {
  public final Boolean dtr,rts; public final int readTimeout;
  public Attempt(Boolean dtr,Boolean rts,int readTimeout){this.dtr=dtr;this.rts=rts;this.readTimeout=readTimeout;}
  public String id(){return (dtr==null?"driver-default":dtr+"/"+rts)+"/"+readTimeout;}
 }
 private final List<Attempt> attempts=new ArrayList<>();
 private int index; private long openedAt=-1,nextPoll,firstByte=-1,notBefore,requestedAt=-1,pollMs=POLL_MS,requestTimeouts;
 private boolean awaitingResponse;
 private boolean needsOpen=true,failedReported; private long bytes;
 private String phase="CONNECTING",failure="",lastReading="INCOMPLETE_FRAME";
 public ScaleAutoSession(Attempt verified){
  if(verified!=null&&supported(verified))attempts.add(verified);
  for(Attempt a:new Attempt[]{new Attempt(null,null,1000),new Attempt(false,false,1000),new Attempt(true,true,1000),new Attempt(true,false,1000),new Attempt(false,true,1000),new Attempt(true,true,250)}){
   boolean duplicate=false;for(Attempt old:attempts)if(old.id().equals(a.id()))duplicate=true;if(!duplicate)attempts.add(a);
  }
 }
 private static boolean supported(Attempt a){return (a.dtr==null)==(a.rts==null)&&(a.readTimeout==1000||a.readTimeout==250&&Boolean.TRUE.equals(a.dtr)&&Boolean.TRUE.equals(a.rts));}
 public Attempt attempt(){return attempts.get(index);}
 public int attemptNumber(){return index+1;}
 public int attemptLimit(){return attempts.size();}
 public String phase(){return phase;}
 public String failure(){return failure;}
 public long receivedBytes(){return bytes;}
 public long pollIntervalMs(){return pollMs;}
 public long requestTimeouts(){return requestTimeouts;}
 public Action tick(long now){
  if(phase.equals("INCOMPATIBLE")){if(!failedReported){failedReported=true;return Action.FAILED;}return Action.NONE;}
  if(needsOpen&&now>=notBefore){needsOpen=false;return Action.OPEN;}
  if(openedAt<0)return Action.NONE;
  // Once any bytes arrive, electrical changes cannot fix parsing. Preserve that link.
  if(!phase.equals("AVAILABLE")){
   if(firstByte<0&&now-openedAt>=ATTEMPT_MS){advance(now,"NO_DATA_AFTER_WINDOWS_P");return tick(now);}
   if(firstByte>=0&&now-firstByte>=FRAME_WAIT_MS){fail(lastReading);return tick(now);}
  }
  if(now>=nextPoll){
   if(awaitingResponse&&now-requestedAt<RESPONSE_TIMEOUT_MS)return Action.NONE;
   if(awaitingResponse)requestTimeouts++;
   awaitingResponse=true;requestedAt=now;nextPoll=now+pollMs;return Action.POLL;
  }
  return Action.NONE;
 }
 public void opened(long now){openedAt=now;nextPoll=now;firstByte=-1;awaitingResponse=false;requestedAt=-1;pollMs=POLL_MS;phase="DETECTING";}
 public void bytes(long now,int count){if(count>0){bytes+=count;if(firstByte<0)firstByte=now;}}
 // Called only for a complete response, never for a USB fragment or empty separator.
 public void reading(String code,boolean valid,boolean stable){lastReading=code;awaitingResponse=false;pollMs=code.equals("VALID_WEIGHT")||code.equals("WAITING_STABILITY")||code.equals("UNSTABLE_WEIGHT")?FAST_POLL_MS:POLL_MS;if(requestedAt>=0)nextPoll=requestedAt+pollMs;if(valid&&stable)phase="AVAILABLE";}
 public void transportFailed(long now,String code){advance(now,code);}
 private void advance(long now,String code){
  openedAt=-1;firstByte=-1;awaitingResponse=false;requestedAt=-1;pollMs=POLL_MS;
  if(++index>=attempts.size()){index=attempts.size()-1;fail(code);return;}
  needsOpen=true;notBefore=now+200;phase="CONNECTING";
 }
 private void fail(String code){failure=code;phase="INCOMPATIBLE";openedAt=-1;needsOpen=false;}
}
