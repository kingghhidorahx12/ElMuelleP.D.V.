package mx.elmuelle.pdv;
import org.junit.Test;import static org.junit.Assert.*;
public class UpdatePolicyTest {
 private final String hash="1".repeat(64),cert=UpdatePolicy.CERTIFICATE;
 @Test public void acceptsSameApplicationAndOriginalSignerOnly(){UpdatePolicy.validate("mx.elmuelle.pdv",13,14,hash,hash,cert,cert);}
 @Test public void refusesDowngrade(){assertThrows(SecurityException.class,()->UpdatePolicy.validate("mx.elmuelle.pdv",14,14,hash,hash,cert,cert));}
 @Test public void refusesAnotherApplication(){assertThrows(SecurityException.class,()->UpdatePolicy.validate("mx.otro.pos",13,14,hash,hash,cert,cert));}
 @Test public void refusesChangedBytes(){assertThrows(SecurityException.class,()->UpdatePolicy.validate("mx.elmuelle.pdv",13,14,hash,"2".repeat(64),cert,cert));}
 @Test public void refusesOtherSigningKey(){assertThrows(SecurityException.class,()->UpdatePolicy.validate("mx.elmuelle.pdv",13,14,hash,hash,cert,"0".repeat(64)));}
}
