package mx.elmuelle.pdv;
/** Display may show a recognized moving weight. This never grants a sale. */
public final class ScaleDisplay {
 public static boolean available(ScaleDecoder.Reading value,boolean connected,long now,long frameAt){
  return connected&&value!=null&&ScaleSerialPolicy.fresh(now,frameAt)&&Double.isFinite(value.kg)&&value.kg>=0&&(value.valid||value.code.equals("WAITING_STABILITY")||value.code.equals("UNSTABLE_WEIGHT"));
 }
}
