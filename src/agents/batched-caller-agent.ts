import { IObject } from "../adapter";
import { Agent } from "../agent";
import { CallerBroker } from "../brokers";

const CallableTarget = function () {};
const ILSymbol = Symbol("IL");

export class BatchedCallerAgent<T extends IObject>
  extends Agent<CallerBroker>
  implements ProxyHandler<T>, PromiseLike<any>
{
  protected readonly il: number;
  protected readonly instructions: BatchedCallerAgent.Instruction[];

  constructor(options: BatchedCallerAgent.Options) {
    super(options.key, options.broker);
    this.il = options.il || 0;
    this.instructions = options.instructions || [];
  }

  get [ILSymbol](): BatchedCallerAgent.Instruction.ILIntermediate {
    return {
      __il: this.il,
    };
  }

  get(target: T, p: string | symbol, receiver: any) {
    if (typeof p === "symbol") {
      return Reflect.get(this, p, this);
    }
    if (p === "then") {
      return this.then.bind(this);
    }
    if (p === "toJSON") {
      return this.toJSON.bind(this);
    }
    const instruction: BatchedCallerAgent.Instruction.Get = {
      t: "get",
      il: this.il,
      p,
    };
    this.instructions.push(instruction);
    return new Proxy(
      CallableTarget,
      new BatchedCallerAgent({
        key: this.key,
        broker: this.broker,
        instructions: this.instructions,
        il: this.instructions.length,
      })
    );
  }

  set(target: T, p: string | symbol, newValue: any, receiver: any): boolean {
    if (typeof p === "symbol") {
      return Reflect.set(this, p, newValue, this);
    }
    const instruction: BatchedCallerAgent.Instruction.Set = {
      t: "set",
      il: this.il,
      p,
      v: BatchedCallerAgent.Instruction.normalizeValue(newValue),
    };
    this.instructions.push(instruction);
    return true;
  }

  apply(target: T, thisArg: any, argArray: any[]) {
    const instruction: BatchedCallerAgent.Instruction.Apply = {
      t: "apply",
      il: this.il,
      a:
        argArray &&
        (BatchedCallerAgent.Instruction.normalizeValue(argArray) as any),
    };
    this.instructions.push(instruction);
    return new Proxy(
      CallableTarget,
      new BatchedCallerAgent({
        key: this.key,
        broker: this.broker,
        instructions: this.instructions,
        il: this.instructions.length,
      })
    );
  }

  getPrototypeOf(target: T): object {
    return Reflect.getPrototypeOf(this);
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: (value: any) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): PromiseLike<TResult1 | TResult2> {
    return this.broker
      .request({
        type: this.batchType,
        payload: this.instructions,
      })
      .then(onfulfilled)
      .catch(onrejected);
  }

  toJSON() {
    return this[ILSymbol];
  }
}

export namespace BatchedCallerAgent {
  export interface Options {
    key: string;
    broker: CallerBroker;
    instructions?: BatchedCallerAgent.Instruction[];
    il?: number;
  }
  export type Instruction =
    | Instruction.Get
    | Instruction.Set
    | Instruction.Apply
    | Instruction.Return;
  export namespace Instruction {
    export type ILPrimitive = string | number | boolean | null;
    export interface ILIntermediate {
      __il: number;
    }
    export type ILValue = ILPrimitive | ILIntermediate | ILObject | ILArray;
    export type ILObject = { [x: string | number]: ILValue };
    export interface ILArray extends Array<ILValue> {}

    export interface Get {
      t: "get";
      il: number;
      p: string | number;
    }
    export interface Set {
      t: "set";
      il: number;
      p: string | number;
      v: ILValue;
    }
    export interface Apply {
      t: "apply";
      il: number;
      a?: ILValue[];
    }
    export interface Return {
      t: "return";
      v?: ILValue;
    }
    export function normalizeValue(raw: unknown): ILValue {
      return JSON.parse(JSON.stringify(raw));
    }
  }
}
