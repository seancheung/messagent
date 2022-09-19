import { IAdapter, IObject } from "../adapter";
import { DeepAgent } from "../agent";
import { BatchedCallerAgent, DeferredCallerAgent } from "../agents";
import { Broker } from "../broker";
import {
  BrokerMessage,
  BrokerRequest,
  BrokerResponse,
  isEvent,
  isResponse,
} from "../message";
import { IRegistrar } from "../registrar";
import { DefaultRegistrar } from "../registrars/default-registrar";
import { nextTick } from "../utils";

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
        if (typeof msg.error === "string") {
          error.name = msg.error;
        } else if (typeof msg.error === "object") {
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
          }
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
        Array.from(listeners).filter((e) => e !== handler)
      );
    };
  }

  /**
   * Get an deferred agent
   * @param key Agent key
   */
  useAgent<T extends IObject>(key: string): DeepAgent<T>;
  /**
   * Run operations with batched agent
   * @param key Agent key
   * @param func Batch function
   * @returns Function return value
   */
  useAgent<T extends IObject, R>(
    key: string,
    func: (agent: T) => R
  ): Promise<R>;
  useAgent<T extends IObject, R>(
    key: string,
    func?: (agent: T) => R
  ): DeepAgent<T> | Promise<R> {
    if (!func) {
      return new Proxy(
        {} as any,
        new DeferredCallerAgent<T>({
          broker: this,
          key,
        })
      );
    }
    const instructions: BatchedCallerAgent.Instruction[] = [];
    const agent = new BatchedCallerAgent<T>({
      key,
      broker: this,
      instructions,
    });
    const res: any = BatchedCallerAgent.Instruction.normalizeValue(
      func(new Proxy({} as T, agent))
    );
    const instruction: BatchedCallerAgent.Instruction.Return = {
      t: "return",
      v: res,
    };
    instructions.push(instruction);
    return Promise.resolve(agent);
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
}
