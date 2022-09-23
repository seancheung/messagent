import { IObject } from '../adapter';
import { Agent } from '../agent';
import type { CalleeBroker } from '../brokers';
import { BatchedCallerAgent } from './batched-caller-agent';
import { DeferredCallerAgent } from './deferred-caller-agent';

export class CalleeAgent<T extends IObject> extends Agent<CalleeBroker> {
  protected readonly deep: boolean;
  constructor(protected readonly target: T, options: CalleeAgent.Options) {
    super(options.key, options.broker);
    this.deep = options.deep;
  }

  protected onDeferred: CalleeBroker.MessageHandler = (
    _,
    payload: DeferredCallerAgent.Instruction[],
  ) => {
    if (!this.deep && payload.filter((e) => e.t === 'get').length > 1) {
      throw new Error('Invalid deep access');
    }
    return payload.reduce((target: any, instruction) => {
      let value: any;
      switch (instruction.t) {
        case 'get':
          value = Reflect.get(target, instruction.p, target);
          break;
        case 'set':
          Reflect.set(target, instruction.p, instruction.v);
          break;
        case 'apply': {
          value = Reflect.apply(target, undefined, instruction.a);
          break;
        }
        default:
          throw new Error('Unknown instruction type');
      }
      if (typeof value === 'function') {
        value = value.bind(target);
      }
      return value;
    }, this.target);
  };

  protected onBatched: CalleeBroker.MessageHandler = (
    _,
    payload: BatchedCallerAgent.Instruction[],
  ) => {
    if (!this.deep) {
      throw new Error('Invalid deep access');
    }
    const stack: any[] = [this.target];
    const revive = BatchedCallerAgent.Instruction.resolveStack.bind(
      undefined,
      stack,
    );
    async function evaluate(instructions: BatchedCallerAgent.Instruction[]) {
      for (const instruction of instructions) {
        if (instruction.t === 'return') {
          if (instruction.v === undefined) {
            return stack[stack.length - 1];
          }
          return revive(instruction.v);
        }
        const target = stack[instruction.il];
        let value: any;
        switch (instruction.t) {
          case 'get':
            value = Reflect.get(target, instruction.p, target);
            break;
          case 'set':
            Reflect.set(target, instruction.p, revive(instruction.v));
            break;
          case 'apply':
            value = Reflect.apply(target, undefined, revive(instruction.a));
            break;
          case 'del':
            Reflect.deleteProperty(target, instruction.p);
            break;
          case 'ctor':
            value = Reflect.construct(target, revive(instruction.a));
            break;
          case 'await':
            value = await target;
            break;
          case 'bin':
            {
              switch (instruction.o) {
                case '+':
                  value = revive(instruction.a[0]) + revive(instruction.a[1]);
                  break;
                case '-':
                  value = revive(instruction.a[0]) - revive(instruction.a[1]);
                  break;
                case '*':
                  console.log(instruction, stack);
                  value = revive(instruction.a[0]) * revive(instruction.a[1]);
                  break;
                case '/':
                  value = revive(instruction.a[0]) / revive(instruction.a[1]);
                  break;
              }
            }
            break;
          case 'it':
            {
              switch (instruction.f) {
                case 'map':
                  value = [];
                  for (let i = 0; i < target.length; i++) {
                    stack.splice(instruction.il + 1, 3, target[i], i, target);
                    const res = await evaluate(instruction.l);
                    value.push(res);
                  }
                  stack.splice(instruction.il + 1, 3);
                  stack.splice(instruction.il + 1, value.length, value);
                  break;
              }
            }
            break;
          default:
            throw new Error('Unknown instruction type');
        }
        if (typeof value === 'function') {
          value = value.bind(target);
        }
        stack.push(value);
      }
    }
    return evaluate(payload);
  };

  /**
   * Inject target as agent
   */
  inject(): void {
    this.broker.setHandler(this.deferredType, this.onDeferred);
    this.broker.setHandler(this.batchType, this.onBatched);
  }

  /**
   * Eject agent
   */
  eject(): void {
    this.broker.removeHandler(this.deferredType);
    this.broker.removeHandler(this.batchType);
  }
}

export namespace CalleeAgent {
  export interface Options {
    key: string;
    broker: CalleeBroker;
    deep?: boolean;
  }
}
