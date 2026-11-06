package mx.elmuelle.pdv;
import android.content.Context;import android.view.View;import android.view.inputmethod.EditorInfo;import android.view.inputmethod.InputConnection;import android.webkit.WebView;import org.json.JSONObject;

/** Real-size WebView: Chromium handles desktop page scale, not a view transform. */
public final class DesktopWebView extends WebView {
 private volatile DesktopGeometry geometry;
 public DesktopWebView(Context context){super(context);setDefaultFocusHighlightEnabled(false);setOverScrollMode(View.OVER_SCROLL_NEVER);setHorizontalScrollBarEnabled(false);setVerticalScrollBarEnabled(false);}
 public String viewport(){try{DesktopGeometry frame=geometry;return new JSONObject().put("cssWidth",DesktopGeometry.CSS_WIDTH).put("scale",frame==null?1:frame.metaScale).toString();}catch(Exception error){return "{}";}}
 @Override protected void onSizeChanged(int w,int h,int oldW,int oldH){super.onSizeChanged(w,h,oldW,oldH);if(w<=0||h<=0)return;geometry=new DesktopGeometry(w,h,getResources().getDisplayMetrics().density);post(()->evaluateJavascript("window.dispatchEvent(new Event('android-viewport-changed'));",null));}
 @Override public InputConnection onCreateInputConnection(EditorInfo info){InputConnection connection=super.onCreateInputConnection(info);info.imeOptions|=EditorInfo.IME_FLAG_NO_EXTRACT_UI|EditorInfo.IME_FLAG_NO_FULLSCREEN;return connection;}
}
