import java.awt.AlphaComposite;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.ImageIO;

/** Package the original circular mark within Android's icon mask, without redrawing it. */
public class PrepareSplash {
 public static void main(String[] args) throws Exception {
  BufferedImage original=ImageIO.read(Path.of(args[0]).toFile());
  if(original==null||!original.getColorModel().hasAlpha())throw new IllegalArgumentException("Original logo needs transparency");
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
