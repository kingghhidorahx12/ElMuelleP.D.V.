package mx.elmuelle.pdv;
import android.content.*;import android.content.pm.*;import android.os.Build;import android.net.Uri;import java.io.*;import java.security.*;import org.json.JSONObject;
final class ApkUpdateHost {
 static String hex(byte[] data){StringBuilder out=new StringBuilder();for(byte b:data)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}
 static String signer(PackageInfo info)throws Exception {android.content.pm.Signature[] values=Build.VERSION.SDK_INT>=28?(info.signingInfo==null?null:info.signingInfo.getApkContentsSigners()):info.signatures;if(values==null||values.length!=1)throw new SecurityException("Firma de actualización no válida.");return hex(MessageDigest.getInstance("SHA-256").digest(values[0].toByteArray()));}
 static Intent verifiedIntent(Context context,JSONObject metadata)throws Exception {
  File folder=new File(context.getCacheDir(),"apk-updates").getCanonicalFile(),file=new File(metadata.getString("file")).getCanonicalFile();if(!file.getParentFile().equals(folder)||!file.isFile()||file.length()!=metadata.getLong("bytes")||file.length()>170L*1024*1024)throw new SecurityException("Archivo de actualización no válido.");
  MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream input=new FileInputStream(file)){byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))!=-1)digest.update(buffer,0,n);}
  PackageManager manager=context.getPackageManager();int flags=Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;PackageInfo installed=manager.getPackageInfo(context.getPackageName(),flags),proposed=manager.getPackageArchiveInfo(file.getPath(),flags);if(proposed==null)throw new SecurityException("La descarga no contiene una APK válida.");
  long oldVersion=Build.VERSION.SDK_INT>=28?installed.getLongVersionCode():installed.versionCode,newVersion=Build.VERSION.SDK_INT>=28?proposed.getLongVersionCode():proposed.versionCode;if(newVersion!=metadata.getLong("versionCode"))throw new SecurityException("La versión no coincide con su manifiesto.");
  UpdatePolicy.validate(proposed.packageName,oldVersion,newVersion,metadata.getString("sha256"),hex(digest.digest()),signer(installed),signer(proposed));
  Uri uri=androidx.core.content.FileProvider.getUriForFile(context,context.getPackageName()+".updates",file);return new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
 }
}
