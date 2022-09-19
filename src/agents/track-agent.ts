import { IObject } from "../adapter";
import { Agent } from "../agent";
import { CallerBroker } from "../brokers";

const CallableTarget = function () {};
const ILSymbol = Symbol("IL");

export class TrackAgent<T extends IObject>
  extends Agent<CallerBroker>
  implements ProxyHandler<T>, PromiseLike<any>
{
  protected readonly il: number;
  protected readonly ops: Agent.BatchOperation[];

  constructor(options: TrackAgent.Options, il?: number) {
    super(options.key, options.broker);
    this.ops = options.ops;
    this.il = il;
  }

  get [ILSymbol]() {
    return this.il;
  }

  get(target: T, p: string | symbol, receiver: any) {
    if (typeof p === "symbol") {
      return Reflect.get(this, p, this);
    }
    const il = this.ops.length;
    this.ops.push({
      type: "get",
      prop: p,
      il: this.il,
    });
    return new Proxy(
      CallableTarget,
      new TrackAgent(
        {
          key: this.key,
          broker: this.broker,
          ops: this.ops,
        },
        il
      )
    );
  }

  set(target: T, p: string | symbol, newValue: any, receiver: any): boolean {
    if (typeof p === "symbol") {
      return Reflect.set(this, p, newValue, this);
    }
    newValue = this.resolveValue(newValue);
    this.ops.push({
      type: "set",
      prop: p,
      value: newValue,
      il: this.il,
    });
    return true;
  }

  apply(target: T, thisArg: any, argArray: any[]) {
    argArray = argArray?.map((arg) => this.resolveValue(arg));
    const il = this.ops.length;
    this.ops.push({
      type: "apply",
      args: argArray,
      il: this.il,
    });
    return new Proxy(
      CallableTarget,
      new TrackAgent(
        {
          key: this.key,
          broker: this.broker,
          ops: this.ops,
        },
        il
      )
    );
  }

  getPrototypeOf(target: T): object {
    return Reflect.getPrototypeOf(this);
  }

  resolveValue(value: unknown) {
    if (value instanceof TrackAgent) {
      value = value[ILSymbol];
      if (value == null || value < 0 || value > this.ops.length - 1) {
        throw new Error("Invalid value");
      }
      return { __il: value };
    }
    return value;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: (value: any) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): PromiseLike<TResult1 | TResult2> {
    return this.broker
      .request({
        type: this.batchType,
        payload: this.ops,
      })
      .then(onfulfilled)
      .catch(onrejected);
  }
}

export namespace TrackAgent {
  export interface Options {
    key: string;
    broker: CallerBroker;
    ops: Agent.BatchOperation[];
  }
}
