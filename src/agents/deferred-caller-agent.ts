import { IObject } from '../adapter';
import { Agent } from '../agent';
import { CallerBroker } from '../brokers';

const CallableTarget = function () {};

export class DeferredCallerAgent<T extends IObject>
  extends Agent<CallerBroker>
  implements ProxyHandler<T>, PromiseLike<any>
{
  protected readonly instructions: DeferredCallerAgent.Instruction[];

  constructor(options: DeferredCallerAgent.Options) {
    super(options.key, options.broker);
    this.instructions = options.instructions || [];
  }

  get(target: T, p: string | symbol) {
    if (typeof p === 'symbol') {
      return Reflect.get(this, p, this);
    }
    if (p === 'then') {
      return this.then.bind(this);
    }
    const instruction: DeferredCallerAgent.Instruction.Get = {
      t: 'get',
      p,
    };
    return new Proxy(
      CallableTarget,
      new DeferredCallerAgent({
        key: this.key,
        broker: this.broker,
        instructions: [...this.instructions, instruction],
      }),
    );
  }

  set(target: T, p: string | symbol, newValue: any): boolean {
    if (typeof p === 'symbol') {
      return Reflect.set(this, p, newValue, this);
    }
    const instruction: DeferredCallerAgent.Instruction.Set = {
      t: 'set',
      p,
      v: newValue,
    };
    this.broker.send({
      type: this.deferredType,
      payload: [...this.instructions, instruction],
    });
    return true;
  }

  apply(target: T, thisArg: any, argArray: any[]) {
    const instruction: DeferredCallerAgent.Instruction.Apply = {
      t: 'apply',
      a: argArray,
    };
    return new Proxy(
      CallableTarget,
      new DeferredCallerAgent({
        key: this.key,
        broker: this.broker,
        instructions: [...this.instructions, instruction],
      }),
    );
  }

  getPrototypeOf(): object {
    return Reflect.getPrototypeOf(this);
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: (value: any) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>,
  ): PromiseLike<TResult1 | TResult2> {
    return this.broker
      .request({
        type: this.deferredType,
        payload: this.instructions,
      })
      .then(onfulfilled)
      .catch(onrejected);
  }
}

export namespace DeferredCallerAgent {
  export interface Options {
    key: string;
    broker: CallerBroker;
    instructions?: DeferredCallerAgent.Instruction[];
  }
  export type Instruction =
    | Instruction.Get
    | Instruction.Set
    | Instruction.Apply;
  export namespace Instruction {
    export interface Get {
      t: 'get';
      p: string | number;
    }
    export interface Set {
      t: 'set';
      p: string | number;
      v: any;
    }
    export interface Apply {
      t: 'apply';
      a?: any[];
    }
  }
}
