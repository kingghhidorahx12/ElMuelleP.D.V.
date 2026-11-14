package mx.elmuelle.pdv;

import android.content.Context;
import android.graphics.*;
import android.view.View;

/** One continuous branded cover, removed only after the POS has painted. */
public final class BrandedStartupView extends View {
 private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
 private final Bitmap logo;
 public BrandedStartupView(Context context){
  super(context);BitmapFactory.Options options=new BitmapFactory.Options();options.inScaled=false;
  logo=BitmapFactory.decodeResource(getResources(),R.drawable.muelle_round_icon,options);
  setContentDescription("El Muelle PDV. Preparando tu espacio de trabajo.");
  setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
  setClickable(true);
 }
 @Override protected void onDraw(Canvas canvas){
  super.onDraw(canvas);float w=getWidth(),h=getHeight();if(w<=0||h<=0)return;
  paint.setShader(new LinearGradient(0,0,w,h,new int[]{Color.rgb(12,31,58),Color.rgb(7,61,107)},null,Shader.TileMode.CLAMP));
  canvas.drawRect(0,0,w,h,paint);paint.setShader(null);
  Path wave=new Path();wave.moveTo(0,h*.83f);wave.cubicTo(w*.3f,h*.57f,w*.63f,h*1.08f,w,h*.73f);wave.lineTo(w,h);wave.lineTo(0,h);wave.close();
  paint.setColor(Color.argb(24,74,180,220));canvas.drawPath(wave,paint);
  wave.reset();wave.moveTo(0,h*.91f);wave.cubicTo(w*.3f,h*.67f,w*.68f,h*1.12f,w,h*.85f);wave.lineTo(w,h);wave.lineTo(0,h);wave.close();
  paint.setColor(Color.argb(18,116,207,237));canvas.drawPath(wave,paint);
  float unit=Math.min(getResources().getDisplayMetrics().density*1.3f,Math.min(w/640f,h/310f));
  float cx=w/2,top=(h-256*unit)/2,logoSize=176*unit;
  paint.setColor(Color.WHITE);
  if(logo!=null){float[] bounds=BrandGeometry.fit(logo.getWidth(),logo.getHeight(),cx,top,logoSize);canvas.drawBitmap(logo,null,new RectF(bounds[0],bounds[1],bounds[2],bounds[3]),paint);}
  paint.setTextAlign(Paint.Align.CENTER);paint.setTypeface(Typeface.create("sans-serif",Typeface.BOLD));paint.setTextSize(25*unit);
  canvas.drawText("EL MUELLE",cx,top+188*unit,paint);
  paint.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));paint.setTextSize(12*unit);paint.setColor(Color.rgb(246,202,104));
  canvas.drawText("PDV  ·  PUNTO DE VENTA",cx,top+209*unit,paint);
  paint.setStrokeWidth(1.5f*unit);canvas.drawLine(cx-24*unit,top+224*unit,cx+24*unit,top+224*unit,paint);
  paint.setTypeface(Typeface.create("sans-serif",Typeface.NORMAL));paint.setTextSize(10*unit);paint.setColor(Color.rgb(195,222,241));
  canvas.drawText("Preparando tu espacio de trabajo",cx,top+247*unit,paint);
 }
 public void revealApp(){animate().alpha(0f).setDuration(240).withEndAction(()->{setVisibility(GONE);setClickable(false);}).start();}
}
