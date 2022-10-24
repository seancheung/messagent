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
export type SyncExpression =
  | GetExpression
  | SetExpression
  | DelExpression
  | ConstructExpression
  | ApplyExpression
  | ReturnExpression
  | MathExpression
  | ArgumentExpression;
export type MixedExpression = SyncExpression | AsyncExpression;

export interface ClosureArgument {
  $$type: 'closure';
  $$exps: Expression[];
}

export function getBrokerMessageType(targetKey: string) {
  return `agent.invoke.${targetKey}`;
}
