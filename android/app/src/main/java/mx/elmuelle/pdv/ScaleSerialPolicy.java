package mx.elmuelle.pdv;
import java.nio.charset.StandardCharsets;import java.util.*;
/** Serial transport policy; model and protocol are never inferred from VID/PID. */
public final class ScaleSerialPolicy {
 public static final String WINDOWS_SOURCE_SHA256="A15227CC7AE19FEE6207B696CA0E30EEE72E268162749D8BDDEA39C3D8A44792";
 public static byte[] windowsBar9Command(){return new byte[]{0x50};}
 public static boolean approvedBar9Transport(int vid,int pid){return vid==0x1a86&&pid==0x7523;}
 public static boolean isCh34x(int vid,int pid){return vid==0x1a86&&(pid==0x7523||pid==0x5523);}
 public static byte[] command(String text,boolean confirmed){if(!confirmed||text==null||text.isEmpty())return new byte[0];if(!Arrays.asList("P","P\r","P\r\n").contains(text))throw new IllegalArgumentException("COMMAND_NOT_SUPPORTED");return text.getBytes(StandardCharsets.US_ASCII);}
 public static boolean fresh(long now,long validAt){return validAt>=0&&now>=validAt&&now-validAt<=1500;}
}
