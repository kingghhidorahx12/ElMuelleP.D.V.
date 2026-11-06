package mx.elmuelle.pdv;
import org.junit.Test;import static org.junit.Assert.*;
public class DesktopGeometryTest {
 @Test public void phoneUsesBothAvailableDimensions(){check(2340,1080,3);check(1080,480,2.75f);check(800,360,2);}
 @Test public void tabletUsesBothAvailableDimensions(){check(2560,1600,2);check(1280,800,1);check(1366,768,1);}
 @Test public void keyboardChangesHeightWithoutChangingTextScale(){DesktopGeometry full=new DesktopGeometry(2340,1080,3),keyboard=new DesktopGeometry(2340,500,3),restored=new DesktopGeometry(2340,1080,3);assertEquals(full.metaScale,keyboard.metaScale,0);assertTrue(keyboard.cssHeight<full.cssHeight);assertEquals(full.cssHeight,restored.cssHeight,0);assertEquals(full.width,restored.width);assertEquals(full.height,restored.height);}
 @Test public void aspectRatioChangesHeightWithoutMobileColumns(){DesktopGeometry wide=new DesktopGeometry(2340,1080,3),tablet=new DesktopGeometry(1600,1000,2);assertTrue(wide.cssHeight<tablet.cssHeight);assertEquals(1366,DesktopGeometry.CSS_WIDTH);}
 @Test public void rejectsInvalidBounds(){try{new DesktopGeometry(0,360,2);fail();}catch(IllegalArgumentException expected){}}
 private void check(int w,int h,float density){DesktopGeometry g=new DesktopGeometry(w,h,density);assertEquals(w,g.width);assertEquals(h,g.height);assertEquals(w,1366*g.metaScale*density,0.001);assertEquals(h,g.cssHeight*g.metaScale*density,0.001);assertEquals(1366f*h/w,g.cssHeight,0.001);}
}
