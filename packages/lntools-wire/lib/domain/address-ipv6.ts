import { Address } from "./address";
import { AddressType } from "./address-type";

export class AddressIPv6 extends Address {
  /**
   * Represents an IPv6 address with the host and port.
   */
  constructor(host: string, port: number) {
    super(host, port);
  }

  get type(): AddressType {
    return AddressType.IPv6;
  }

  public toString() {
    return `[${this.host}]:${this.port}`;
  }
}
