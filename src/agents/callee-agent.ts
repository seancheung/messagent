import { IObject } from "../adapter";
import { Agent } from "../agent";
import { BatchedCallerAgent, DeferredCallerAgent } from "../agents";
import type { CalleeBroker } from "../brokers";

export class CalleeAgent<T extends IObject> extends Agent<CalleeBroker> {
  protected readonly deep: boolean;
  constructor(protected readonly target: T, options: CalleeAgent.Options) {
    super(options.key, options.broker);
    this.deep = options.deep;
  }

  protected onDeferred: CalleeBroker.MessageHandler = (
    _,
    payload: DeferredCallerAgent.Instruction[]
  ) => {
    if (!this.deep && payload.filter((e) => e.t === "get").length > 1) {
      throw new Error("Invalid deep access");
    }
    return payload.reduce((target: any, instruction) => {
      let value: any;
      switch (instruction.t) {
        case "get":
          value = Reflect.get(target, instruction.p, target);
          break;
        case "set":
          Reflect.set(target, instruction.p, instruction.v);
          break;
        case "apply": {
          value = Reflect.apply(target, undefined, instruction.a);
          break;
        }
        default:
          throw new Error("Unknown instruction type");
      }
      if (typeof value === "function") {
        value = value.bind(target);
      }
      return value;
    }, this.target);
  };

  protected onBatched: CalleeBroker.MessageHandler = (
    _,
    payload: BatchedCallerAgent.Instruction[]
  ) => {
    if (!this.deep) {
      throw new Error("Invalid deep access");
    }
    const ils: any[] = [this.target];
    const revive = (input: unknown) =>
      input == null
        ? input
        : JSON.parse(JSON.stringify(input), (_, v) => {
            if (typeof v.__il === "number" && Reflect.ownKeys(v).length === 1) {
              return ils[v.__il];
            }
            return v;
          });
    for (const instruction of payload) {
      if (instruction.t === "return") {
        return revive(instruction.v);
      }
      const target = ils[instruction.il];
      let value: any;
      switch (instruction.t) {
        case "get":
          value = Reflect.get(target, instruction.p, target);
          break;
        case "set":
          Reflect.set(target, instruction.p, revive(instruction.v));
          break;
        case "apply":
          // TODO: async?
          value = Reflect.apply(target, undefined, revive(instruction.a));
          break;
        case "del":
          Reflect.deleteProperty(target, instruction.p);
          break;
        case "ctor":
          value = Reflect.construct(target, revive(instruction.a));
          break;
        default:
          throw new Error("Unknown instruction type");
      }
      if (typeof value === "function") {
        value = value.bind(target);
      }
      ils.push(value);
    }
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
