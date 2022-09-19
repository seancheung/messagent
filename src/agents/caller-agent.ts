import { IObject } from "../adapter";
import { Agent } from "../agent";
import type { CallerBroker } from "../brokers";

const CallableTarget = function () {};

export class CallerAgent<T extends IObject>
  extends Agent<CallerBroker>
  implements ProxyHandler<T>, PromiseLike<any>
{
  protected readonly path: string[];

  constructor(options: CallerAgent.Options) {
    super(options.key, options.broker);
    this.path = options.path || [];
  }

  get(target: T, p: string | symbol, receiver: any) {
    if (typeof p === "symbol") {
      return Reflect.get(this, p, this);
    }
    if (p === "then") {
      return this.then.bind(this);
    }
    return new Proxy(
      CallableTarget,
      new CallerAgent({
        key: this.key,
        broker: this.broker,
        path: [...this.path, p],
      })
    );
  }

  set(target: T, p: string | symbol, newValue: any, receiver: any): boolean {
    if (typeof p === "symbol") {
      return Reflect.set(this, p, newValue, this);
    }
    const payload: Agent.SetPayload = [[...this.path, p], newValue];
    this.broker.send({
      type: this.setType,
      payload,
    });
    return true;
  }

  apply(target: T, thisArg: any, argArray: any[]) {
    const payload: Agent.ApplyPayload = [this.path, argArray];
    return this.broker.request({
      type: this.applyType,
      payload,
    });
  }

  getPrototypeOf(target: T): object {
    return Reflect.getPrototypeOf(this);
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: (value: any) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): PromiseLike<TResult1 | TResult2> {
    const payload: Agent.GetPayload = this.path;
    return this.broker
      .request({
        type: this.getType,
        payload,
      })
      .then(onfulfilled)
      .catch(onrejected);
  }

  [Symbol.toStringTag] = () => {
    return this.path.join(".");
  };
}

export namespace CallerAgent {
  export interface Options {
    key: string;
    broker: CallerBroker;
    path?: string[];
  }
}
