import Base from "noflo-runtime-base";

export class IPCRuntime extends Base {
  constructor(options = {}) {
    super(options);
    this.connections = [];
    if (options.catchExceptions) {
      process.on('uncaughtException', (err) => {
        this.connections.forEach((connection) => {
          this.send('network', 'error', err, {
            connection,
          });
          if (err.stack) {
            console.error(err.stack);
          } else {
            console.error(`Error: ${err.toString()}`);
          }
        });
      });
    }

    if (options.captureOutput) {
      this.startCapture();
    }
  }

  send(protocol, topic, payload, context) {
    if (!context || !context.connection || !context.connection.connected) {
      return;
    }
    let normalizedPayload = payload;
    if (payload instanceof Error) {
      normalizedPayload = normalizePayload(payload);
    }
    if (protocol === 'runtime' && topic === 'packet') {
      // With exported port packets we need to go one deeper
      normalizedPayload.payload = normalizePayload(normalizedPayload.payload);
    }
    debugSend(`${protocol}:${topic}`);
    context.connection.sendUTF(JSON.stringify({
      protocol,
      command: topic,
      payload: normalizedPayload,
    }));
    super.send(protocol, topic, payload, context);
  }

  sendAll(protocol, topic, payload) {
    this.connections.forEach((connection) => {
      this.send(protocol, topic, payload, {
        connection,
      });
    });
  }

  startCapture() {
    this.originalStdOut = process.stdout.write;
    process.stdout.write = (string) => {
      this.connections.forEach((connection) => {
        this.send('network', 'output', {
          message: string.replace(/\n$/, ''),
          type: 'message',
        }, {
          connection,
        });
      });
    };
  }

  stopCapture() {
    if (!this.originalStdOut) {
      return;
    }
    process.stdout.write = this.originalStdOut;
  }
}