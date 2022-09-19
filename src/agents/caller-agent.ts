import { IObject } from "../adapter";
import { Agent } from "../agent";
import type { CallerBroker } from "../brokers";

export class CallerAgent<T extends IObject>
  extends Agent<CallerBroker>
  implements ProxyHandler<T>
{
  protected readonly path: string[];
  protected readonly deep: boolean;

  constructor(options: CallerAgent.Options) {
    super(options.key, options.broker);
    this.deep = options.deep;
    this.path = options.path || [];
  }

  get(target: T, p: string | symbol, receiver: any) {
    if (typeof p === "symbol") {
      throw new Error("Invalid prop key type");
    }
    if (!this.deep) {
      const payload: Agent.GetPayload = this.path;
      return this.broker.request({
        type: this.getType,
        payload,
      });
    }
    return new CallerAgent({
      key: this.key,
      broker: this.broker,
      deep: this.deep,
      path: [...this.path, p],
    });
  }

  set(target: T, p: string | symbol, newValue: any, receiver: any): boolean {
    if (typeof p === "symbol") {
      throw new Error("Invalid prop key type");
    }
    const payload: Agent.SetPayload = [this.path, newValue];
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
}

export namespace CallerAgent {
  export interface Options {
    key: string;
    broker: CallerBroker;
    deep?: boolean;
    path?: string[];
  }
}
