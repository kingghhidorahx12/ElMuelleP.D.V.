package mx.elmuelle.pdv;

/** The browser renders a desktop-width layout inside its real screen bounds. */
public final class DesktopGeometry {
 public static final int CSS_WIDTH=1366;
 public final int width,height;public final float metaScale,cssHeight;
 public DesktopGeometry(int availableWidth,int availableHeight,float density){
  if(availableWidth<=0||availableHeight<=0||density<=0)throw new IllegalArgumentException();
  width=availableWidth;height=availableHeight;
  metaScale=width/(CSS_WIDTH*density);cssHeight=height/(metaScale*density);
 }
}
