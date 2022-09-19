import { IObject, JSONValue } from "./adapter";
import { Broker } from "./broker";

export abstract class Agent<TBroker extends Broker> {
  constructor(
    protected readonly key: string,
    protected readonly broker: TBroker
  ) {}

  /**
   * Deferred type
   */
  protected get deferredType() {
    return `agent.${this.key}.deferred`;
  }

  /**
   * Batch mode type
   */
  protected get batchType() {
    return `agent.${this.key}.batch`;
  }
}

export type ShallowAgent<T extends IObject> = {
  [K in keyof T]: T[K] extends JSONValue
    ? Promise<T[K]>
    : T[K] extends (...args: infer P) => infer R
    ? (...args: P) => Promise<R>
    : never;
};

export type DeepAgent<T extends IObject> = {
  [K in keyof T]: T[K] extends JSONValue
    ? Promise<T[K]>
    : T[K] extends (...args: infer P) => infer R
    ? (...args: P) => Promise<R>
    : T[K] extends IObject
    ? DeepAgent<T[K]>
    : never;
};
