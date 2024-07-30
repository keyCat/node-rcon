import { Rcon } from './types';

const ENCODING: BufferEncoding = 'utf-8';
const PACKET_FIXED_SIZE = 14; // number of bytes for fixed size packet fields: Size(4), ID(4), Type(4), null(1), null(1)
export class RconPacket {
  private $buffer: Buffer;

  /**
   * @description Construct a packet by parsing a buffer.
   * @example
   * ```js
   * const packet = new RconPacket(buffer);
   * ```;
   * */
  constructor(id: Buffer);
  /**
   * @description Construct a packet from id, type and payload.
   * @param {number} id - The packet id.
   * @param {Rcon.PacketType} type - The packet type.
   * @param {string} [payload] - The packet payload.
   * @example
   * ```js
   * const packet = new RconPacket(414, Rcon.PacketType.SERVERDATA_EXECCOMMAND, "restart");
   * ```
   * */
  constructor(id: number, type: Rcon.PacketType, payload?: string);
  constructor(
    id: number | Buffer,
    type: Rcon.PacketType = Rcon.PacketType.UNKNOWN,
    payload: string = '',
  ) {
    if (Buffer.isBuffer(id)) {
      this.$buffer = id;
    } else {
      this.pack(id, type, payload);
    }
  }

  /**
   * @protected
   * @description Pack the packet into a buffer.
   * @param {number} id - The packet id.
   * @param {Rcon.PacketType} [type=Rcon.PacketType.UNKNOWN] - The packet type.
   * @param {string} [payload=''] - The packet payload.
   * */
  protected pack(
    id: number,
    type: Rcon.PacketType = Rcon.PacketType.UNKNOWN,
    payload: string = '',
  ): void {
    // https://developer.valvesoftware.com/wiki/Source_RCON_Protocol#Packet_Size
    const size = Buffer.byteLength(payload, ENCODING) + PACKET_FIXED_SIZE;
    this.$buffer = Buffer.alloc(size);
    this.$buffer.writeInt32LE(size - 4, 0);
    this.$buffer.writeInt32LE(id, 4);
    this.$buffer.writeInt32LE(type, 8);
    this.$buffer.write(payload || '', 12, size - PACKET_FIXED_SIZE, ENCODING);
    // 0x00 0x00
    this.$buffer.writeInt16LE(0, size - 2);
  }

  public get buffer(): Buffer {
    return this.$buffer;
  }

  public get size(): number {
    return this.$buffer.readInt32LE(0);
  }

  public get id(): number {
    return this.$buffer.readInt32LE(4);
  }

  public get type(): Rcon.PacketType {
    const type = this.$buffer.readInt32LE(8);
    if (Object.values(Rcon.PacketType).includes(type)) {
      return type;
    } else {
      return Rcon.PacketType.UNKNOWN;
    }
  }

  public get payload(): string {
    return this.$buffer.toString(ENCODING, 12, this.$buffer.length - 2) || '';
  }

  /**
   * @description Check if the packet is in response to a given packet.
   * */
  public inResponseTo(pkt: RconPacket): boolean {
    if (!pkt) return false;
    if (pkt.id !== this.id) return false;

    switch (this.type) {
      case Rcon.PacketType.SERVERDATA_AUTH_RESPONSE:
        return pkt.type === Rcon.PacketType.SERVERDATA_AUTH;
      case Rcon.PacketType.SERVERDATA_RESPONSE_VALUE:
        return (
          pkt.type === Rcon.PacketType.SERVERDATA_EXECCOMMAND ||
          pkt.type === Rcon.PacketType.BOUNDARY
        );
      default:
        return false;
    }
  }

  /**
   * @description Convert instance to a string.
   * @example
   * ```js
   * const packet = new RconPacket(414, Rcon.PacketType.SERVERDATA_EXECCOMMAND, "restart");
   * console.log(packet.toString());
   * // RconPacket{"size":414,"id":1,"type":2,"payload":"restart"}
   * ```
   * */
  public toString(): string {
    return `RconPacket${JSON.stringify({
      size: this.size,
      id: this.id,
      type: this.type,
      payload:
        this.type === Rcon.PacketType.SERVERDATA_AUTH
          ? `<hidden>`
          : this.payload,
    })}`;
  }
}
