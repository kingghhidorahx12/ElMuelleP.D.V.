package mx.elmuelle.pdv;
import java.net.*;

/** Discovery opens and closes TCP only. No ESC/POS, HTTP, credentials or payload. */
public final class LocalPrinterProbe {
 public interface Connector{Socket open()throws Exception;}
 public static boolean available(String host,int port,Connector connector){
  PrinterNetworkPolicy.validate(host,port);
  try(Socket socket=connector.open()){socket.connect(new InetSocketAddress(host,port),350);return true;}catch(Exception unavailable){return false;}
 }
 private LocalPrinterProbe(){}
}
