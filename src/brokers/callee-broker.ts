import { IAdapter } from "../adapter";
import { Broker } from "../broker";
import {
  BrokerMessage,
  BrokerRequest,
  BrokerResponse,
  isEvent,
  isRequest,
} from "../message";
import { formatError, nextTick } from "../utils";

/**
 * Called by `CallerBroker`
 */
export class CalleeBroker extends Broker {
  protected readonly handlers = new Map<string, CalleeBroker.MessageHandler>();

  constructor(options: CalleeBroker.Options) {
    super(options.adapter);
  }

  protected reply(id: string, error?: Error, payload?: any) {
    const msg: BrokerResponse = {
      id,
      error: formatError(error),
      payload,
    };
    this.adapter.send({ ...msg });
  }

  protected handle(msg: BrokerRequest | BrokerMessage) {
    const handler = this.handlers.get(msg.type);
    if (!handler) {
      return;
    }
    let req: CalleeBroker.RequestContext | undefined;
    if (isRequest(msg)) {
      let isDone: boolean | undefined;
      const { id } = msg;
      req = {
        end: (error?: Error, payload?: any) => {
          if (isDone) {
            throw new Error("request already closed");
          }
          this.reply(id, error, payload);
          isDone = true;
        },
        get isDone() {
          return isDone;
        },
      };
    }
    const ctx: CalleeBroker.MessageHandlerContext = {
      req,
    };
    handler.call(undefined, ctx, msg.payload);
  }

  protected onAdapterMessage(msg: unknown) {
    if (msg == null) {
      return;
    }
    if (isRequest(msg) || isEvent(msg)) {
      nextTick(() => this.handle(msg));
    }
  }

  /**
   * Raise an event
   * @param msg Message to send
   */
  send(msg: BrokerMessage): void {
    this.adapter.send({ ...msg });
  }

  /**
   * Add a handler for the given message type
   * @param type Message type
   * @param handler Message handler
   * @returns Remove handler function
   */
  addHandler(type: string, handler: CalleeBroker.MessageHandler) {
    this.handlers.set(type, handler);
    return () => {
      if (this.handlers.get(type) === handler) {
        this.handlers.delete(type);
      }
    };
  }

  /**
   * Add a safe handler for the given message type
   * @param type Message type
   * @param handler Message handler
   * @returns Remove handler function
   * @description
   * - support async
   * - support return value as reply data
   * - errors will be caught and sent
   */
  setSafeHandler(type: string, handler: CalleeBroker.SafeMessageHandler) {
    this.handlers.set(type, async (ctx, payload) => {
      let res: any;
      let error: any;
      try {
        res = await handler(ctx, payload);
      } catch (e) {
        error = e;
      }
      if (ctx.req && !ctx.req.isDone) {
        ctx.req.end(error, res);
      }
    });
    return () => {
      if (this.handlers.get(type) === handler) {
        this.handlers.delete(type);
      }
    };
  }

  /**
   * Add plugin
   * @param plugin Plugin
   */
  use(plugin: CalleeBroker.Plugin) {
    plugin(this);
  }

  dispose(): void {
    this.handlers.clear();
    super.dispose();
  }
}

export namespace CalleeBroker {
  export interface Options {
    /**
     * Adapter
     */
    adapter: IAdapter;
  }
  export interface RequestContext {
    /**
     * check if the current request is done
     */
    readonly isDone: boolean;
    /**
     * Finish current request without response data
     */
    end(): void;
    /**
     * Finish current request with error
     * @param error Error
     */
    end(error: Error): void;
    /**
     * Finish current request with error or data
     * @param error Error
     * @param data Data
     */
    end(error: undefined, data: any): void;
  }
  export interface MessageHandlerContext {
    /**
     * Request context
     */
    readonly req?: RequestContext;
  }
  export type MessageHandler = (
    ctx: MessageHandlerContext,
    payload?: any
  ) => void;
  export type SafeMessageHandler = (
    ctx: MessageHandlerContext,
    payload?: any
  ) => any;
  export type Plugin = (broker: CalleeBroker) => void;
}
