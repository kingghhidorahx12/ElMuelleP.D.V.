import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.ImageIO;
import mx.elmuelle.pdv.BrandGeometry;
import java.util.zip.ZipFile;

/** Pixel and placement regressions; does not claim a physical launcher test. */
public class TestBrandAssets {
 private static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
 private static boolean warm(int pixel){int r=(pixel>>16)&255,g=(pixel>>8)&255,b=pixel&255;return (pixel>>>24)>127&&r>175&&g>130&&r>b+15&&g>b+5;}
 private static int[] bounds(BufferedImage image,boolean ring){
  int left=image.getWidth(),top=image.getHeight(),right=0,bottom=0;
  for(int y=0;y<image.getHeight();y++)for(int x=0;x<image.getWidth();x++)if(ring?warm(image.getRGB(x,y)):(image.getRGB(x,y)>>>24)>127){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
  return new int[]{left,top,right,bottom};
 }
 private static void circle(BufferedImage image,double expectedFraction){
  int[] ring=bounds(image,true),alpha=bounds(image,false);int w=ring[2]-ring[0],h=ring[3]-ring[1];
  require(Math.abs(w-h)<=2,"Visible ring must be circular, not just the PNG canvas");
  require(Math.abs(w-image.getWidth()*expectedFraction)<=3,"Safe-area diameter changed");
  require(Math.abs(ring[0]+ring[2]-image.getWidth())<=2&&Math.abs(ring[1]+ring[3]-image.getHeight())<=2,"Ring not centered");
  require(alpha[0]>0&&alpha[1]>0&&alpha[2]<image.getWidth()&&alpha[3]<image.getHeight(),"Transparent safe margins missing");
  double cx=(ring[0]+ring[2]-1)/2.0,cy=(ring[1]+ring[3]-1)/2.0,radius=Math.min(w,h)/2.0;
  for(int angle=0;angle<360;angle++){
   double radians=Math.toRadians(angle);boolean found=false;
   for(double r=radius*.965;r<radius;r+=.5){int x=(int)Math.round(cx+Math.cos(radians)*r),y=(int)Math.round(cy+Math.sin(radians)*r);if(warm(image.getRGB(x,y))){found=true;break;}}
   require(found,"Ring clipped or flattened at angle "+angle);
  }
 }
 public static void main(String[] args)throws Exception{
  Path root=Path.of(args[0]),out=Path.of(args[1]);Files.createDirectories(out);
  PrepareSplash.main(new String[]{root.resolve("public/assets/brand/el-muelle-shortcut-icon.png").toString(),out.resolve("splash.png").toString(),out.resolve("icon.png").toString()});
  circle(ImageIO.read(out.resolve("icon.png").toFile()),.78);
  circle(ImageIO.read(out.resolve("splash.png").toFile()),.60);
  int cases=0;
  for(int[] dimensions:new int[][]{{1254,1254},{864,864},{1084,1041},{1200,600},{600,1200}})for(float size:new float[]{48,96,176,264,528}){
   float[] box=BrandGeometry.fit(dimensions[0],dimensions[1],683,40,size);float w=box[2]-box[0],h=box[3]-box[1];
   require(Math.abs(w/h-(float)dimensions[0]/dimensions[1])<.001,"Nonuniform startup scaling");
   require(Math.abs((box[0]+box[2])/2-683)<.01&&Math.abs((box[1]+box[3])/2-(40+size/2))<.01,"Startup alignment changed");
   require(Math.max(w,h)<=size+.01,"Startup mark outside box");cases++;
  }
  for(float size:new float[]{0,-1,Float.NaN,Float.POSITIVE_INFINITY}){boolean failed=false;try{BrandGeometry.fit(10,10,0,0,size);}catch(IllegalArgumentException expected){failed=true;}require(failed,"Invalid geometry accepted");}
  String html=Files.readString(root.resolve("public/index.html"));require(html.contains("<p>Pescadería</p>")&&!html.contains("<p>Marisquería</p>"),"Sidebar brand is incorrect");
  boolean packaged=args.length>=6;
  if(packaged)try(ZipFile apk=new ZipFile(args[2])){
   for(int i=3;i<6;i++){var entry=apk.getEntry(args[i]);require(entry!=null,"Missing packaged brand resource");try(var stream=apk.getInputStream(entry)){circle(ImageIO.read(stream),i==5?.60:.78);}}
   try(var stream=apk.getInputStream(apk.getEntry("assets/nodeapp/app/public/index.html"))){String packagedHtml=new String(stream.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);require(packagedHtml.contains("<p>Pescadería</p>")&&!packagedHtml.contains("<p>Marisquería</p>"),"Packaged sidebar is incorrect");}
  }
  String result="{\"passed\":true,\"circleAnglesPerAsset\":360,\"assets\":2,\"placementCases\":"+cases+",\"invalidGeometryCases\":4,\"sidebarPescaderia\":true,\"packagedApkVerified\":"+packaged+",\"physicalDeviceVerified\":false}";
  Files.writeString(out.resolve("result.json"),result);System.out.println(result);
 }
}
