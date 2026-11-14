import java.awt.AlphaComposite;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.awt.geom.Ellipse2D;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.ImageIO;

/** Correct the source mark's oval bounds; retain its artwork and safe margins. */
public class PrepareSplash {
 public static BufferedImage circularMark(BufferedImage source){
  int left=source.getWidth(),top=source.getHeight(),right=0,bottom=0;
  for(int y=0;y<source.getHeight();y++)for(int x=0;x<source.getWidth();x++){
   int pixel=source.getRGB(x,y),r=(pixel>>16)&255,g=(pixel>>8)&255,b=pixel&255;
   if((pixel>>>24)>127&&r>175&&g>130&&r>b+15&&g>b+5){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
  }
  if(right-left<source.getWidth()/2||bottom-top<source.getHeight()/2)throw new IllegalArgumentException("No complete gold/ivory ring found");
  // A square bitmap alone does not make the inner border circular. Normalize
  // the border's measured source rectangle into one square, preserving the art.
  int size=1254,diameter=(int)Math.round(size*.78),inset=(size-diameter)/2;
  BufferedImage badge=new BufferedImage(diameter,diameter,BufferedImage.TYPE_INT_ARGB);
  Graphics2D draw=badge.createGraphics();draw.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);
  draw.drawImage(source,0,0,diameter,diameter,left,top,right,bottom,null);draw.dispose();
  BufferedImage mask=new BufferedImage(diameter,diameter,BufferedImage.TYPE_INT_ARGB);Graphics2D shape=mask.createGraphics();
  shape.setRenderingHint(RenderingHints.KEY_ANTIALIASING,RenderingHints.VALUE_ANTIALIAS_ON);shape.setColor(java.awt.Color.WHITE);shape.fill(new Ellipse2D.Double(0,0,diameter,diameter));shape.dispose();
  draw=badge.createGraphics();draw.setComposite(AlphaComposite.DstIn);draw.drawImage(mask,0,0,null);draw.dispose();
  BufferedImage result=new BufferedImage(size,size,BufferedImage.TYPE_INT_ARGB);draw=result.createGraphics();draw.drawImage(badge,inset,inset,null);draw.dispose();
  System.out.println("Brand geometry: source ring "+(right-left)+"x"+(bottom-top)+", circular target "+diameter+"x"+diameter);
  return result;
 }
 public static void main(String[] args) throws Exception {
  BufferedImage source=ImageIO.read(Path.of(args[0]).toFile());
  if(source==null)throw new IllegalArgumentException("Original logo is not readable");
  BufferedImage original=circularMark(source);
  if(args.length>2){Path icon=Path.of(args[2]);Files.createDirectories(icon.getParent());if(!ImageIO.write(original,"png",icon.toFile()))throw new IllegalStateException("PNG encoder unavailable");}
  int left=original.getWidth(),top=original.getHeight(),right=0,bottom=0;
  for(int y=0;y<original.getHeight();y++)for(int x=0;x<original.getWidth();x++)if((original.getRGB(x,y)>>>24)!=0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
  if(right<=left||bottom<=top)throw new IllegalArgumentException("Empty logo");
  int canvasSize=864;
  double scale=canvasSize*.60/Math.max(right-left,bottom-top);
  int width=(int)Math.round(original.getWidth()*scale),height=(int)Math.round(original.getHeight()*scale);
  BufferedImage canvas=new BufferedImage(canvasSize,canvasSize,BufferedImage.TYPE_INT_ARGB);
  Graphics2D graphics=canvas.createGraphics();
  graphics.setComposite(AlphaComposite.Src);
  graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);
  graphics.drawImage(original,(canvasSize-width)/2,(canvasSize-height)/2,width,height,null);
  graphics.dispose();
  Path output=Path.of(args[1]);Files.createDirectories(output.getParent());
  if(!ImageIO.write(canvas,"png",output.toFile()))throw new IllegalStateException("PNG encoder unavailable");
 }
}
