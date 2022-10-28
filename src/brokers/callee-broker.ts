import { IAdapter } from '../adapters';
import { CalleeAgent } from '../agents';
import { formatError, nextTick } from '../utils';
import {
  Broker,
  BrokerMessage,
  BrokerRequest,
  BrokerResponse,
  isEvent,
  isRequest,
} from './broker';

/**
 * Called by `CallerBroker`
 */
export class CalleeBroker extends Broker {
  protected readonly handlers = new Map<
    string,
    CalleeBroker.MessageRawHandler
  >();
  protected readonly agents = new Map<string, CalleeAgent>();

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
            throw new Error('request already closed');
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
   * Publish an event
   * @param msg Message to send
   */
  publish(msg: BrokerMessage): void {
    this.adapter.send({ ...msg });
  }

  /**
   * Set a raw handler for the given message type
   * @param type Message type
   * @param handler Message handler
   * @returns Remove handler function
   * @description This will override previously set handler of the same type
   */
  setRawHandler(type: string, handler: CalleeBroker.MessageRawHandler) {
    this.handlers.set(type, handler);
    return () => {
      if (this.handlers.get(type) === handler) {
        this.handlers.delete(type);
      }
    };
  }

  /**
   * Set a wrapped handler for the given message type
   * @param type Message type
   * @param handler Message handler
   * @returns Remove handler function
   * @description
   * - This will override previously set handler of the same type
   * - support async
   * - support return value as reply data
   * - errors will be caught and sent
   */
  setHandler(type: string, handler: CalleeBroker.MessageHandler) {
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
   * Remove handler of the given type
   * @param type Message type
   */
  removeHandler(type: string) {
    this.handlers.delete(type);
  }

  /**
   * Inject agent
   * @param key Agent key
   * @param target Agent target
   * @returns Eject agent funtion
   */
  injectAgent(key: string, target: any): () => void {
    if (this.agents.has(key)) {
      throw new Error('Agent key conflict');
    }
    const agent = new CalleeAgent(target, {
      targetKey: key,
      broker: this,
    });
    agent.inject();
    this.agents.set(key, agent);
    return () => {
      agent.eject();
      this.agents.delete(key);
    };
  }

  /**
   * Eject agent
   * @param key Agent key
   * @returns `true` if an agent with the given key has been ejected
   */
  ejectAgent(key: string): boolean {
    this.agents.get(key)?.eject();
    return this.agents.delete(key);
  }

  /**
   * Reset data
   */
  reset() {
    this.handlers.clear();
    this.agents.clear();
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
  export type MessageRawHandler = (
    ctx: MessageHandlerContext,
    payload?: any,
  ) => void;
  export type MessageHandler = (
    ctx: MessageHandlerContext,
    payload?: any,
  ) => any;
  export type Plugin = (broker: CalleeBroker) => void;
}
