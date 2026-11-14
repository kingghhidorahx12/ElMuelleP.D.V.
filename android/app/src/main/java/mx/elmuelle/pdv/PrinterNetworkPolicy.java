package mx.elmuelle.pdv;
public final class PrinterNetworkPolicy {
 public static void validate(String host,int port){if(host==null||!host.matches("\\d{1,3}(\\.\\d{1,3}){3}")||port<1||port>65535)throw new IllegalArgumentException("Escribe la IP local de la impresora y un puerto válido.");String[] parts=host.split("\\.");int[] ip=new int[4];for(int i=0;i<4;i++){ip[i]=Integer.parseInt(parts[i]);if(ip[i]>255||!Integer.toString(ip[i]).equals(parts[i]))throw new IllegalArgumentException("IP local inválida.");}if(!(ip[0]==10||ip[0]==192&&ip[1]==168||ip[0]==172&&ip[1]>=16&&ip[1]<=31))throw new IllegalArgumentException("La impresora LAN debe estar en la red local privada.");}
 private PrinterNetworkPolicy(){}
}
