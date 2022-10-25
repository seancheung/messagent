import { IAdapter, IObject } from '../adapters';
import { CallerAgent, MathHelper } from '../agents';
import { IRegistrar } from '../registrars';
import { DefaultRegistrar } from '../registrars/default-registrar';
import { nextTick } from '../utils';
import {
  Broker,
  BrokerMessage,
  BrokerRequest,
  BrokerResponse,
  isEvent,
  isResponse,
} from './broker';

/**
 * Calls `CalleeBroker`
 */
export class CallerBroker extends Broker {
  protected readonly registrar: IRegistrar;
  protected readonly eventSubscribers: Map<
    string,
    Iterable<CallerBroker.EventHandler>
  > = new Map();
  protected readonly responseHandlers: Map<
    string,
    CallerBroker.ResponseHandler
  > = new Map();

  constructor(options: CallerBroker.Options) {
    super(options.adapter);
    this.registrar = options.registrar || new DefaultRegistrar();
  }

  protected handleEvent(msg: BrokerMessage) {
    const handlers = this.eventSubscribers.get(msg.type);
    for (const handler of handlers) {
      handler.call(null, msg.payload);
    }
  }

  protected handleResponse(msg: BrokerResponse) {
    const handler = this.responseHandlers.get(msg.id);
    if (handler) {
      this.responseHandlers.delete(msg.id);
      let error: Error;
      if (msg.error) {
        error = new Error();
        if (typeof msg.error === 'string') {
          error.name = msg.error;
        } else if (typeof msg.error === 'object') {
          error.name = msg.error.name;
          error.message = msg.error.message;
        }
      }
      handler.call(null, error, msg.payload);
    }
  }

  protected onAdapterMessage(msg: unknown) {
    if (msg == null) {
      return;
    }
    if (isResponse(msg)) {
      nextTick(() => this.handleResponse(msg));
    } else if (isEvent(msg)) {
      nextTick(() => this.handleEvent(msg));
    }
  }

  /**
   * Send a message without the need of a response
   * @param msg Message to send
   */
  send(msg: BrokerMessage): void {
    this.adapter.send({ ...msg });
  }

  /**
   * Send a message with the need of a response
   * @param msg Message to send
   * @param cb Response handler
   */
  request(msg: BrokerMessage, cb: CallerBroker.ResponseHandler): void;
  /**
   * Send a message with the need of a response
   * @param msg Message to send
   * @returns Response
   */
  request<T = any>(msg: BrokerMessage): Promise<T>;
  request(msg: BrokerMessage, cb?: CallerBroker.ResponseHandler) {
    if (cb === undefined) {
      return new Promise((resolve, reject) => {
        this.request(
          msg,
          (error?: Error, payload?: any, streaming?: boolean) => {
            if (error) {
              reject(error);
            } else if (!streaming) {
              resolve(payload);
            }
          },
        );
      });
    }
    const id = this.registrar.next();
    this.responseHandlers.set(id, cb);
    const data: BrokerRequest = {
      ...msg,
      id,
    };
    this.adapter.send({ ...data });
  }

  /**
   * Subscribe to an event
   * @param type Event type
   * @param handler Event handler
   * @returns Unsubscribe function
   */
  subscribe(type: string, handler: CallerBroker.EventHandler) {
    const listeners = this.eventSubscribers.get(type) || [];
    this.eventSubscribers.set(type, [...listeners, handler]);
    return () => {
      const listeners = this.eventSubscribers.get(type);
      this.eventSubscribers.set(
        type,
        Array.from(listeners).filter((e) => e !== handler),
      );
    };
  }

  /**
   * Run deferred operations with agent
   * @param key Agent key
   * @param func Batch function
   * @returns Function return value
   */
  async useAgent<T extends IObject, R = void>(
    key: string,
    func: (target: T, helpers: CallerBroker.Helpers) => R | Promise<R>,
  ): Promise<R> {
    const agent = new CallerAgent({ targetKey: key, broker: this });
    const target = agent.getProxiedTarget();
    const math = agent.getMathObject();
    const ret = func(target, { Math: math });
    return agent.resolve(ret);
  }

  /**
   * Reset data
   */
  reset() {
    this.eventSubscribers.clear();
    this.responseHandlers.clear();
    this.registrar.reset();
  }

  dispose() {
    super.dispose();
  }
}

export namespace CallerBroker {
  export interface Options {
    /**
     * Adapter
     */
    adapter: IAdapter;
    /**
     * Registrar
     */
    registrar?: IRegistrar;
  }
  export type EventHandler = (payload?: any) => void;
  export type ResponseHandler = (error?: Error, payload?: any) => void;
  export interface Helpers {
    Math: MathHelper;
  }
}
