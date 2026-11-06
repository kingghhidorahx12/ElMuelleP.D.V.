package mx.elmuelle.pdv;
import java.io.ByteArrayOutputStream;import java.nio.charset.StandardCharsets;import java.util.*;import java.util.regex.*;
/** Strict, complete weight frames only. A USB chip is not a scale model. */
public final class ScaleDecoder {
 public interface FrameListener {void frame(byte[] bytes,String format,boolean weightOnly);}
 public static final class Reading {
  public final boolean valid,stable;public final double kg;public final String message,code,format;
  Reading(boolean v,boolean s,double k,String m,String c,String f){valid=v;stable=s;kg=k;message=m;code=c;format=f;}
 }
 private static final String NUMBER="([+-]?[ ]*\\d{1,6}(?:[.,]\\d{1,4})?)";
 private static final Pattern STATUS=Pattern.compile("^(ST|US)[ ,]+(?:(?:GS|NT)[ ,]+)?"+NUMBER+"[ ]*(kg|g|lb)$",Pattern.CASE_INSENSITIVE);
 private static final Pattern UNIT=Pattern.compile("^"+NUMBER+"[ ]*(kg|g|lb)$",Pattern.CASE_INSENSITIVE);
 private final String protocol,unit;private final double max;private String reportedUnit="";
 private double previous=Double.NaN;private String previousUnit="";private int samples;private boolean rejected,stx;private long frameSequence;
 private final StringBuilder buffer=new StringBuilder();private final ByteArrayOutputStream raw=new ByteArrayOutputStream();private FrameListener listener;
 private Reading latest=invalid("NO_FRAME","Sin trama de peso completa","unknown");
 public ScaleDecoder(String protocol,String unit,double max){if(!Arrays.asList("ascii-auto-safe","ascii-st-us","ascii-explicit-unit","hid-pos-scale").contains(protocol)||!(Arrays.asList("kg","g","lb").contains(unit)||protocol.equals("ascii-auto-safe")&&unit.equals("auto"))||!Double.isFinite(max)||max<=0||max>10000)throw new IllegalArgumentException();this.protocol=protocol;this.unit=unit;this.max=max;}
 public synchronized String reportedUnit(){return reportedUnit;}
 public synchronized void setFrameListener(FrameListener value){listener=value;}
 public synchronized long frameSequence(){return frameSequence;}
 public synchronized Reading current(){return latest;}
 private static Reading invalid(String code,String text,String format){return new Reading(false,false,0,text,code,format);}
 private void resetSamples(){previous=Double.NaN;previousUnit="";samples=0;}
 public synchronized Reading feed(byte[] bytes){
  if(protocol.equals("hid-pos-scale")){if(bytes.length>0){frameSequence++;hid(bytes);if(listener!=null)listener.frame(bytes,"hid-pos-scale",false);}return latest;}
  for(byte b:bytes){int c=b&255;if(raw.size()<128)raw.write(c);
   if(c==10||c==13||c==3&&stx){
    if(rejected){frameSequence++;if(listener!=null)listener.frame(raw.toByteArray(),"unknown",false);}
    else if(buffer.length()>0){frameSequence++;boolean known=parse(buffer.toString());if(listener!=null)listener.frame(raw.toByteArray(),latest.format,known);}
    buffer.setLength(0);raw.reset();rejected=false;stx=false;
   }else if(c==2&&!stx&&!rejected&&buffer.length()==0){stx=true;latest=invalid("INCOMPLETE_FRAME","Trama STX incompleta","unknown");}
   else if(c>=32&&c<=126||c==9){
    if(rejected)continue;latest=invalid("INCOMPLETE_FRAME","Esperando completar la trama","unknown");
    if(buffer.length()>=120){buffer.setLength(0);resetSamples();rejected=true;latest=invalid("FRAME_TOO_LONG","Trama demasiado larga; no se interpreta como peso","unknown");}
    else buffer.append((char)c);
   }else{buffer.setLength(0);resetSamples();rejected=true;latest=invalid("FRAME_BYTES","Se recibieron bytes incompatibles con el formato ASCII","unknown");}
  }return latest;
 }
 private boolean parse(String text){
  String line=text.trim();Matcher status=STATUS.matcher(line),plain=UNIT.matcher(line);
  boolean isStatus=status.matches(),isPlain=plain.matches();
  if((protocol.equals("ascii-st-us")&&!isStatus)||(protocol.equals("ascii-explicit-unit")&&!isPlain)||(!isStatus&&!isPlain)){
   resetSamples();latest=invalid(line.matches("(?i)^(OL|OVER|OVERLOAD|ERR|ERROR)(?:[ ,].*)?$")?"SCALE_REPORTED_ERROR":"FORMAT_UNKNOWN","Hay datos USB, pero su formato no coincide con un peso reconocido","unknown");return false;
  }
  Matcher match=isStatus?status:plain;int group=isStatus?2:1;double value=Double.parseDouble(match.group(group).replace(" ","").replace(',','.'));
  String parsedUnit=match.group(group+1).toLowerCase(Locale.ROOT),format=isStatus?"ascii-st-us":"ascii-explicit-unit";
  boolean stable=isStatus&&match.group(1).equalsIgnoreCase("ST");
  double kg=parsedUnit.equals("g")?value/1000:parsedUnit.equals("lb")?value*.45359237:value;
  reportedUnit=parsedUnit;
  if(!(unit.equals("auto")||parsedUnit.equals(unit))||!Double.isFinite(kg)||kg<0||kg>max){resetSamples();latest=invalid("WEIGHT_OR_UNIT_RANGE","Unidad distinta o peso fuera del límite configurado",format);return true;}
  if(isStatus){resetSamples();latest=new Reading(stable,stable,Math.round(kg*1000)/1000d,stable?"Peso estable informado por la báscula":"La báscula informa peso inestable",stable?"VALID_WEIGHT":"UNSTABLE_WEIGHT",format);}
  else {samples=parsedUnit.equals(previousUnit)&&Double.isFinite(previous)&&Math.abs(kg-previous)<=.0005?samples+1:1;previous=kg;previousUnit=parsedUnit;stable=samples>=3;latest=new Reading(stable,stable,Math.round(kg*1000)/1000d,stable?"Peso repetido en tres tramas completas":"Esperando tres tramas completas iguales",stable?"VALID_WEIGHT":"WAITING_STABILITY",format);}
  return true;
 }
 private void hid(byte[] b){
  if(b.length!=6||b[0]!=3){latest=invalid("HID_FORMAT","Reporte HID POS desconocido","hid-pos-scale");return;}
  int status=b[1]&255,code=b[2]&255,exponent=b[3];String u=code==2?"g":code==3?"kg":code==12?"lb":"";
  if(!u.equals(unit)||exponent< -4||exponent>3||status!=4){latest=invalid("HID_UNSTABLE_OR_UNIT","HID no estable, unidad incompatible o error de báscula","hid-pos-scale");return;}
  double value=((b[4]&255)|((b[5]&255)<<8))*Math.pow(10,exponent),kg=u.equals("g")?value/1000:u.equals("lb")?value*.45359237:value;
  if(!Double.isFinite(kg)||kg<0||kg>max){latest=invalid("WEIGHT_OR_UNIT_RANGE","Peso fuera del límite configurado","hid-pos-scale");return;}
  latest=new Reading(true,true,Math.round(kg*1000)/1000d,"Peso HID estable","VALID_WEIGHT","hid-pos-scale");
 }
 public synchronized void disconnect(){buffer.setLength(0);raw.reset();resetSamples();reportedUnit="";rejected=false;stx=false;latest=invalid("DISCONNECTED","Báscula desconectada","unknown");}
}
