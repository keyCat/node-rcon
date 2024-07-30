import { Rcon } from './types';
import { QueuedRconConnection } from './connection';

export class RconClient {
  public readonly connection: Rcon.Connection;

  public connected(): boolean {
   return  this.connection.connected;
  }

  /**
   * @description Construct a RCON client.
   * @param {Rcon.ConnectionOptions} options Connection options.
   * */
  constructor(options: Rcon.ConnectionOptions) {
    this.connection = new QueuedRconConnection(options);
  }

  /**
   * @description Connect to the RCON server.
   * */
  public async connect(): Promise<void> {
    await this.connection.connect();
  }

  /**
   * @description Disconnect from the RCON server.
   * */
  public disconnect(): void {
    return this.connection.disconnect();
  }

  /**
   * @description Send command.
   * @param {string} cmd Command.
   * @param {Rcon.SendOptions} [options] Options
   * */
  public async send(cmd: string, options?: Rcon.SendOptions): Promise<string> {
    await this.connect();
    return this.connection.send(cmd, { ...options, multipacket: true });
  }
}
