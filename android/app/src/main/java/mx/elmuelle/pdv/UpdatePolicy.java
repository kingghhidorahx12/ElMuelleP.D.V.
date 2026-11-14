package mx.elmuelle.pdv;
/** Metadata checks supplement Android's own installer signature verification. */
public final class UpdatePolicy {
 public static final String CERTIFICATE="66347436ba4bb5ec9b991b89f0a068680cdbd6020075e7f7d78e7cf6a16effd5";
 public static void validate(String packageName,long installed,long proposed,String expectedHash,String actualHash,String installedSigner,String proposedSigner){
  if(!"mx.elmuelle.pdv".equals(packageName)||proposed<=installed||!expectedHash.matches("[a-f0-9]{64}")||!expectedHash.equals(actualHash)||!CERTIFICATE.equals(installedSigner)||!CERTIFICATE.equals(proposedSigner))throw new SecurityException("La APK no es una actualización auténtica de El Muelle PDV.");
 }
 private UpdatePolicy(){}
}
