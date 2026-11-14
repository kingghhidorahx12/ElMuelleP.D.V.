package mx.elmuelle.pdv;
import android.content.*;import android.net.Uri;import android.graphics.*;import androidx.core.content.FileProvider;import java.io.*;import java.util.*;
/** Resolve a provider selection to one bounded, readable private-cache image. */
final class PhotoSelection {
 static Uri prepare(Context context,Uri uri)throws Exception {
  String scheme=uri.getScheme();if(!"content".equals(scheme))throw new IOException("Selecciona una fotografía desde la galería o Archivos.");
  File folder=new File(context.getCacheDir(),"selected-photos");if(!folder.isDirectory()&&!folder.mkdirs())throw new IOException("No se pudo preparar la fotografía.");
  File[] previous=folder.listFiles();if(previous!=null)for(File f:previous)if(f.lastModified()<System.currentTimeMillis()-86400000)f.delete();
  byte[] bytes;try(InputStream in=context.getContentResolver().openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){
   if(in==null)throw new IOException("La galería no entregó la fotografía. Descárgala primero al dispositivo.");byte[] block=new byte[16384];int n,total=0;while((n=in.read(block))!=-1){total+=n;if(total>5*1024*1024)throw new IOException("La fotografía excede 5 MiB.");out.write(block,0,n);}bytes=out.toByteArray();
  }
  BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
  if(options.outWidth<=0||options.outHeight<=0||options.outWidth>8192||options.outHeight>8192||(long)options.outWidth*options.outHeight>32000000)throw new IOException("Selecciona una imagen válida de hasta 32 megapíxeles.");
  String extension="image/jpeg".equals(options.outMimeType)?"jpg":"image/png".equals(options.outMimeType)?"png":"image/webp".equals(options.outMimeType)?"webp":null;
  if(extension==null)throw new IOException("Usa una fotografía JPEG, PNG o WebP.");
  File file=new File(folder,UUID.randomUUID()+"."+extension);try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);}return FileProvider.getUriForFile(context,context.getPackageName()+".photos",file);
 }
}
