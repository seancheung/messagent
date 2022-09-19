import { IObject } from "../adapter";
import { Agent } from "../agent";
import type { CalleeBroker } from "../brokers";

export class CalleeAgent<T extends IObject> extends Agent<CalleeBroker> {
  protected readonly deep: boolean;
  constructor(protected readonly target: T, options: CalleeAgent.Options) {
    super(options.key, options.broker);
    this.deep = options.deep;
  }

  protected checkPath(payload: Array<string | number>) {
    if (!payload.length) {
      throw new Error("Invalid access");
    }
    if (!this.deep && payload.length > 1) {
      throw new Error("Invalid deep access");
    }
  }

  protected onGet: CalleeBroker.MessageHandler = (
    _,
    payload: Agent.GetPayload
  ) => {
    this.checkPath(payload);
    const value = payload.reduce((p, c, i) => {
      if (p == null) {
        throw new Error(
          `Accessing null/undefined reference with ${payload
            .slice(0, i + 1)
            .join(".")}`
        );
      }
      return Reflect.get(p, c, p);
    }, this.target);
    return value;
  };

  protected onSet: CalleeBroker.MessageHandler = (
    _,
    payload: Agent.SetPayload
  ) => {
    this.checkPath(payload[0]);
    const target = payload[0].slice(0, -1).reduce((p, c, i) => {
      if (p == null) {
        throw new Error(
          `Accessing null/undefined reference with ${payload[0]
            .slice(0, i + 1)
            .join(".")}`
        );
      }
      return Reflect.get(p, c, p);
    }, this.target);
    const propKey = payload[0][payload[0].length - 1];
    Reflect.set(target, propKey, payload[1]);
  };

  protected onApply: CalleeBroker.MessageHandler = (
    _,
    payload: Agent.ApplyPayload
  ) => {
    this.checkPath(payload[0]);
    const func = payload[0].reduce((p, c, i) => {
      if (p == null) {
        throw new Error(
          `Accessing null/undefined reference with ${payload[0]
            .slice(0, i + 1)
            .join(".")}`
        );
      }
      return Reflect.get(p, c, p);
    }, this.target);
    if (typeof func !== "function") {
      throw new Error(
        `Invoking a non-function value with ${payload[0].join(".")}`
      );
    }
    const thisArg = payload[0]
      .slice(0, -1)
      .reduce((p, c) => Reflect.get(p, c, p), this.target);
    return Reflect.apply(func, thisArg, payload[1]);
  };

  /**
   * Inject target as agent
   */
  inject(): void {
    this.broker.setHandler(this.getType, this.onGet);
    this.broker.setHandler(this.setType, this.onSet);
    this.broker.setHandler(this.applyType, this.onApply);
  }

  /**
   * Eject agent
   */
  eject(): void {
    this.broker.removeHandler(this.getType);
    this.broker.removeHandler(this.setType);
    this.broker.removeHandler(this.applyType);
  }
}

export namespace CalleeAgent {
  export interface Options {
    key: string;
    broker: CalleeBroker;
    deep?: boolean;
  }
}
