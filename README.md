# NodeJS RCON Client

```bash
$ npm install @0x0c/rcon
```

A zero-dependency, fully-typed Node.js library providing an client for interacting with servers that
support [RCON protocol](https://developer.valvesoftware.com/wiki/Source_RCON_Protocol).

Supports multi-packeted responses, timeouts and queuing out of the box.

## Quick Start

```ts
import {RconClient} from '@0x0c/rcon';

const rcon = new RconClient({
    host: '127.0.0.1',
    port: 27015,
    password: '<my-rcon-password>',
});

async function queryStatus() {
    const [status, stats] = await Promise.all([rcon.send('status'), rcon.send('stats')]);
    myCustomParserForStatusCommandResponse(status);
    parseAndStoreServerStats(stats);
    // close connection when it is not required anymore
    rcon.disconnect();
}

queryStatus();
```

## API

### `new RconClient(options): RconClient`

| Argument                 | Type   | Description                                                             |
|--------------------------|--------|-------------------------------------------------------------------------|
| `options`                | object | Options                                                                 |
| `options.host`           | string | IP address or hostname of the server                                    |
| `options.port`           | number | RCON port                                                               |
| `options.password`       | string | RCON Password                                                           |
| [`options.timeout=5000`] | number | Optional. The timeout for the response in milliseconds. Default: `5000` |

### `RconClient.connect(): Promise<void>`

Connect to the server. This method is called automatically when you send the first command, but you can call it manually
if you want to check the connection status after that.

### `RconClient.connected: boolean`

Property that indicates whether the client is connected to the server.

### `RconClient.send(command, options?): Promise<string>`

Send command to the server an return the response as a string.

| Argument                     | Type    | Description                                                                                                                 |
|------------------------------|---------|-----------------------------------------------------------------------------------------------------------------------------|
| `command`                    | string  | Command to send                                                                                                             |
| [`options`]                  | object  | Optional. Options                                                                                                           |
| [`options.timeout`]          | number  | Optional. Set timeout for this command separately from connection timeout. Default: equals to connection timeout            |
| [`options.multipacket=true`] | boolean | Optional. Send at least two commands using a "boundary packet" that helps to read multi-packeted responses. Default: `true` |

### `RconClient.disconnect(): void`

Close the connection to the server. Connection is kept alive between commands, so you should call this method when you
are done to free up resources.

## Notes

By default, all commands are sent with the expectation of _multi-packet response_.

However, this means that even smallest replies may take twice as long (roughly) to resolve due to two packets being
queued: a packet for the command itself, and a "boundary" packet (a junk packet that helps the connection client to
understand when a server has finished replying to the previously sequenced packet).

You can disable this feature when sending:

```ts
const stats = await rcon.send('stats', {multipacket: false});
```
