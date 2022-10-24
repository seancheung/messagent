import type { IObject } from '../adapters';

export interface MathObject {
  add(x: number, y: number): number;
  subtract(x: number, y: number): number;
  multiply(x: number, y: number): number;
  divide(x: number, y: number): number;
}

export interface ReferencedValue {
  $$scope: number;
  $$var: number;
}
export interface Expression {
  type: string;
}
export interface ScopedExpression extends Expression {
  scope: number;
}
export interface TargetExpression extends ScopedExpression {
  target: number;
}
export interface GetExpression extends TargetExpression {
  type: 'get';
  p: string | number;
}
export interface SetExpression extends TargetExpression {
  type: 'set';
  p: string | number;
  newValue?: any;
}
export interface DelExpression extends TargetExpression {
  type: 'del';
  p: string | number;
}
export interface ConstructExpression extends TargetExpression {
  type: 'new';
  args?: any[];
}
export interface ApplyExpression extends TargetExpression {
  type: 'apply';
  args?: any[];
}
export interface ReturnExpression extends Expression {
  type: 'return';
  value?: any;
}
export interface MathExpression extends ScopedExpression {
  type: 'math';
  operator: keyof MathObject;
  x: any;
  y: any;
}
export interface AsyncExpression extends TargetExpression {
  type: 'async';
}
export interface ArgumentExpression extends ScopedExpression {
  type: 'var';
  index: number;
}
export type MixedExpression =
  | GetExpression
  | SetExpression
  | DelExpression
  | ConstructExpression
  | ApplyExpression
  | ReturnExpression
  | MathExpression
  | AsyncExpression
  | ArgumentExpression;

export interface ClosureArgument {
  $$type: 'closure';
  $$exps: Expression[];
}

export function getBrokerMessageType(targetKey: string) {
  return `agent.invoke.${targetKey}`;
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
