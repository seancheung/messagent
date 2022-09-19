import { IObject, JSONPrimitive, JSONValue } from "./adapter";
import { Broker } from "./broker";

export abstract class Agent<TBroker extends Broker> {
  constructor(
    protected readonly key: string,
    protected readonly broker: TBroker
  ) {}

  /**
   * Prop `get` type
   */
  protected get getType() {
    return `agent.${this.key}.get`;
  }

  /**
   * Prop `set` type
   */
  protected get setType() {
    return `agent.${this.key}.set`;
  }

  /**
   * Prop `apply` type
   */
  protected get applyType() {
    return `agent.${this.key}.apply`;
  }

  /**
   * Batch mode type
   */
  protected get batchType() {
    return `agent.${this.key}.batch`;
  }
}

export namespace Agent {
  export type GetPayload = Array<string | number>;
  export type SetPayload = [Array<string | number>, any];
  export type ApplyPayload = [Array<string | number>, any[]?];
  export type BatchPayload = BatchOperation[];

  export interface ILValue {
    __il: number;
  }
  export type LegalValue = JSONPrimitive | ILValue;
  export interface GetOperation {
    type: "get";
    prop: string | number;
    il?: number;
  }
  export interface SetOperation {
    type: "set";
    prop: string | number;
    il?: number;
    value: LegalValue;
  }
  export interface ApplyOperation {
    type: "apply";
    il: number;
    args?: LegalValue[];
  }
  export interface ReturnOperation {
    type: "return";
    value: LegalValue;
  }
  export type BatchOperation =
    | GetOperation
    | SetOperation
    | ApplyOperation
    | ReturnOperation;
  export function isILValue(value: any): value is ILValue {
    return typeof (value as ILValue).__il === "number";
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
