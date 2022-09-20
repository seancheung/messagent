import { IObject } from './adapter';
import { Broker } from './broker';

export abstract class Agent<TBroker extends Broker> {
  constructor(
    protected readonly key: string,
    protected readonly broker: TBroker,
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

export type DeepAgent<T extends IObject> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? (...args: P) => R extends Promise<any> ? R : Promise<R>
    : T[K] extends string | number | boolean | bigint | undefined | null
    ? Promise<T[K]>
    : T[K] extends Array<any>
    ? Promise<T[K]> &
        DeepAgent<{
          [P in keyof T[K]]: P extends number ? never : T[K][P];
        }>
    : Promise<T[K]> & DeepAgent<T[K]>;
};
