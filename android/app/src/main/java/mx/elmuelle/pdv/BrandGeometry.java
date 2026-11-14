package mx.elmuelle.pdv;

/** Fit branded artwork uniformly. Neither screen aspect nor density stretches it. */
public final class BrandGeometry {
 private BrandGeometry(){}
 public static float[] fit(int width,int height,float centerX,float top,float size){
  if(width<=0||height<=0||!Float.isFinite(size)||size<=0)throw new IllegalArgumentException();
  float scale=size/Math.max(width,height),w=width*scale,h=height*scale;
  float left=centerX-w/2,y=top+(size-h)/2;
  return new float[]{left,y,left+w,y+h};
 }
}
