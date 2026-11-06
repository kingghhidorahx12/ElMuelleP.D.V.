package mx.elmuelle.pdv;
import android.content.Context;import android.widget.FrameLayout;

public final class DesktopViewport extends FrameLayout {
 public DesktopViewport(Context context){super(context);setClipChildren(true);setBackgroundColor(android.graphics.Color.rgb(234,246,255));}
}
