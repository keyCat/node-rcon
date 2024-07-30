export module Rcon {
  /**
   * @link https://developer.valvesoftware.com/wiki/Source_RCON_Protocol#Packet_Type
   * */
  export enum PacketType {
    UNKNOWN = -1,
    SERVERDATA_AUTH = 3,
    SERVERDATA_AUTH_RESPONSE = 2,
    SERVERDATA_EXECCOMMAND = 2,
    SERVERDATA_RESPONSE_VALUE = 0,
    BOUNDARY = 255,
  }

  export interface Connection {
    connected: boolean;

    connect(): Promise<void>;

    disconnect(): void;

    send(cmd: string, options?: SendOptions): Promise<string>;
  }

  export interface ConnectionOptions {
    /**
     * @description Host name / IP.
     * */
    host: string;
    /**
     * @description Port number.
     * */
    port: number;
    /**
     * @description Password.
     * */
    password: string;
    /**
     * @description Default timeout for all commands (ms). `0` to disable.
     * @default 5000
     * */
    timeout?: number;
  }

  export interface SendOptions {
    /**
     * @description Timeout for a command. If not specified, connection timeout is used.
     * */
    timeout?: number;
    /**
     * @description If true, response will be processed as multi-packeted.
     * */
    multipacket?: boolean;
  }
}
