package mx.elmuelle.pdv;
import java.io.*;import java.net.*;import java.util.concurrent.*;
public final class LanPrinterTransport {
 public interface Connector {Socket open()throws IOException;}
 public static void send(String host,int port,byte[] data,Connector connector)throws Exception {
  PrinterNetworkPolicy.validate(host,port);if(data==null||data.length>1048576)throw new IllegalArgumentException("Ticket demasiado grande.");
  try(Socket socket=connector.open()){
   FutureTask<Void> task=new FutureTask<>(()->{socket.connect(new InetSocketAddress(host,port),3000);socket.setSoTimeout(3000);if(data.length>0){socket.getOutputStream().write(data);socket.getOutputStream().flush();}return null;});Thread thread=new Thread(task,"muelle-printer-lan");thread.setDaemon(true);thread.start();try{task.get(10,TimeUnit.SECONDS);}catch(TimeoutException error){task.cancel(true);throw new IOException("La impresora LAN no respondió. Revisa la conexión y el papel antes de reimprimir.");}catch(ExecutionException error){throw new IOException("No se completó la conexión LAN: "+error.getCause().getClass().getSimpleName(),error.getCause());}
  }
 }
 private LanPrinterTransport(){}
}
