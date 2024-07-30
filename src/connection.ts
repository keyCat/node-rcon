import { Socket } from 'net';
import { Rcon } from './types';
import { RconPacket } from './packet';
import { cloneErrorProperties } from './utils';

type Command = {
  packet: RconPacket;
  boundary?: RconPacket;
  data: RconPacket[];
  timeout: number;
  onSuccess?: OnSuccessFn;
  onError?: OnErrorFn;
  sent?: boolean;
};
type OnSuccessFn = (pkt: RconPacket[]) => Promise<void> | void;
type OnErrorFn = (err: any) => void;

const password = Symbol('password');

export class QueuedRconConnection implements Rcon.Connection {
  public readonly host: string;
  public readonly port: number;
  public timeout: number;
  private readonly [password]: string;
  private $socket: Socket;
  private $connected: boolean;
  private $connectPromise: Promise<void> | null;
  private $nextPacketId = 0;
  private $responseTimeoutId: NodeJS.Timeout | null = null;
  private readonly $queue: Array<Command> = [];

  /**
   * @private
   * @description Log prefix
   * */
  private get logprefix() {
    return `RCON ${this.host}:${this.port}`;
  }

  /**
   * @private
   * @description Evaluate and return next packet id.
   * */
  private get nextPacketId() {
    if (++this.$nextPacketId > 2 ** 31) {
      this.$nextPacketId = 1;
    }
    return this.$nextPacketId;
  }

  /**
   * @description Is connected.
   * */
  public get connected(): boolean {
    return this.$connected;
  }

  constructor(options: Rcon.ConnectionOptions) {
    this.host = options.host;
    this.port = options.port;
    this[password] = options.password;
    this.timeout = parseInt(String(options.timeout))
      ? Math.max(options.timeout, 0)
      : 5000;
  }

  /**
   * @description Connect to a server.
   * If called while connecting, will return a promise that resolves as soon as connection was established.
   * */
  public async connect(): Promise<void> {
    if (!this.$socket || this.$socket?.destroyed) {
      this.$socket = new Socket();
      this.$connected = false;
    }
    if (this.$connectPromise) {
      return this.$connectPromise;
    }
    if (this.$connected) {
      return;
    }

    this.$connectPromise = new Promise((resolve, reject): void => {
      const handleConnectionError = (err: any) => {
        this.disconnect();
        reject(
          cloneErrorProperties(
            err,
            new Error(`${this.logprefix} ${err.message}`),
          ),
        );
      };
      const handleConnect = async () => {
        this.$socket.off('error', handleConnectionError);
        this.$socket.on('error', (err) => this.handleError(err));
        try {
          await this.authenticate();
          this.$connected = true;
          resolve();
        } catch (err) {
          handleConnectionError(err);
        } finally {
          this.$connectPromise = null;
        }
      };

      this.$socket
        .once('error', handleConnectionError)
        .on('data', (data: Buffer) => this.handleData(data))
        .on('end', () => this.disconnect())
        .connect(
          { host: this.host, port: this.port, keepAlive: true, noDelay: true },
          handleConnect,
        );
    });

    return this.$connectPromise;
  }

  /**
   * @description Disconnect from the server.
   * */
  public disconnect(): void {
    this.$socket?.destroy();
    this.$connected = false;
    this.$socket = null;
    this.$connectPromise = null;
  }

  /**
   * @private
   * @description Send an authentication packet.
   * */
  private async authenticate(): Promise<void> {
    const [authResponse] = await this.sendPacket(
      Rcon.PacketType.SERVERDATA_AUTH,
      this[password],
    );
    if (authResponse.type !== Rcon.PacketType.SERVERDATA_AUTH_RESPONSE) {
      throw new Error(
        `${
          this.logprefix
        } Authentication Failed - Unexpected response (${authResponse.toString()})`,
      );
    }
  }

  /**
   * @description Send a RCON command.
   * @param {string} cmd Command.
   * @param {Rcon.SendOptions} [options] Options
   * */
  public async send(cmd: string, options?: Rcon.SendOptions): Promise<string> {
    if (!this.$connected) {
      throw new Error('QueuedRconConnection socket is not connected');
    }
    const responses = await this.sendPacket(
      Rcon.PacketType.SERVERDATA_EXECCOMMAND,
      cmd,
      options,
    );
    return responses.reduce((response, pkt) => response + pkt.payload, '');
  }

  /**
   * @private
   * @description Prepare and queue packet.
   * @param {Rcon.PacketType} type Packet Type.
   * @param {string} payload Command.
   * @param {Rcon.SendOptions} [options] Options.
   * */
  private async sendPacket(
    type: Rcon.PacketType,
    payload: string = '',
    options?: Rcon.SendOptions,
  ): Promise<RconPacket[]> {
    const packet: RconPacket = new RconPacket(this.nextPacketId, type, payload);
    let boundary: RconPacket | null = null;
    if (options?.multipacket) {
      boundary = new RconPacket(this.nextPacketId, Rcon.PacketType.BOUNDARY);
    }
    return new Promise((resolve, reject): void => {
      this.queuePacket({
        packet,
        boundary,
        onSuccess: (packets) => resolve(packets),
        onError: reject,
        timeout: options?.timeout ?? this.timeout,
      });
      this.processQueue();
    });
  }

  /**
   * @private
   * @description Append command to the queue.
   * @param {object} command Command object
   * @param {RconPacket} command.packet Packet to send.
   * @param {RconPacket} [command.boundary] RconPacket that will serve as a boundary (allows for a multi-packet response).
   * @param {OnSuccessFn} [command.onSuccess] Handler to run on complete response.
   * @param {OnErrorFn} [command.onError] Handler to run on error during the command.
   * @param {OnErrorFn} [command.timeout] Command timeout
   * */
  private queuePacket(
    command: Pick<
      Command,
      'packet' | 'boundary' | 'onSuccess' | 'onError' | 'timeout'
    >,
  ): this {
    this.$queue.push({
      ...command,
      data: [],
      sent: false,
    });
    return this;
  }

  /**
   * @private
   * @description Send a first queued command.
   * */
  private processQueue(): void {
    const [command] = this.$queue;
    if (command && !command.sent) {
      this.$socket.write(command.packet.buffer);
      if (command?.boundary) {
        this.$socket.write(command.boundary.buffer);
      }
      command.sent = true;
      this.startResponseTimeout(command.timeout);
    }
  }

  /**
   * @private
   * @description Data handler for current command.
   * */
  private async handleData(buffer: Buffer): Promise<void> {
    const [command] = this.$queue;
    if (!command) return;

    let finished = false;
    try {
      const response: RconPacket = new RconPacket(buffer);
      const isResponse = response.inResponseTo(command.packet);

      if (isResponse) {
        command.data.push(response);
        this.refreshResponseTimeout();
      }
      if (command.boundary) {
        // process as multi-packet (finish command only when we got a response to the "boundary" packet)
        if (response.inResponseTo(command.boundary)) {
          finished = !!this.$queue.shift();
          await command.onSuccess?.(command.data);
        }
      } else if (isResponse) {
        // process as single-packet (finish command immediately)
        finished = !!this.$queue.shift();
        await command.onSuccess?.(command.data);
      }
    } catch (err) {
      if (!finished) {
        finished = !!this.$queue.shift();
      }
      command.onError?.(err);
    } finally {
      if (finished) {
        this.clearTimeout();
      }
      this.processQueue();
    }
  }

  /**
   * @private
   * @description Error handler for current command.
   * */
  private handleError(err: any) {
    const command = this.$queue.shift();
    if (!command) return;
    command?.onError(
      cloneErrorProperties(err, new Error(`${this.logprefix} ${err.message}`)),
    );
  }

  /**
   * @private
   * @description Start timeout for current command. If timeout is reached, command is discarded with an error.
   * */
  private startResponseTimeout(time: number): void {
    if (!this.$queue.length) return;
    this.$responseTimeoutId = setTimeout(() => {
      const command = this.$queue.shift();
      command?.onError?.(
        new Error(
          `${this.logprefix} timed out ("${command.packet.toString()}")`,
        ),
      );
    }, time);
  }

  /**
   * @private
   * @description Refresh currently active timeout after a partial response.
   * */
  private refreshResponseTimeout(): void {
    this.$responseTimeoutId?.refresh();
  }

  /**
   * @private
   * @description Clear timeout for current command.
   * */
  private clearTimeout(): void {
    clearTimeout(this.$responseTimeoutId);
    this.$responseTimeoutId = null;
  }
}
