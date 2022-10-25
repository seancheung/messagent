export interface MathHelper {
  add(x: number, y: number): number;
  subtract(x: number, y: number): number;
  multiply(x: number, y: number): number;
  divide(x: number, y: number): number;
}

export interface Expression {
  type: string;
}
export interface StackExpression extends Expression {
  scope: number;
  stack: number;
}
export interface GetExpression extends StackExpression {
  type: 'get';
  p: string | number;
}
export interface SetExpression extends StackExpression {
  type: 'set';
  p: string | number;
  newValue?: any;
}
export interface DelExpression extends StackExpression {
  type: 'del';
  p: string | number;
}
export interface ConstructExpression extends StackExpression {
  type: 'new';
  args?: any[];
}
export interface ApplyExpression extends StackExpression {
  type: 'apply';
  args?: any[];
}
export interface ReturnExpression extends Expression {
  type: 'return';
  value?: any;
}
export interface MathExpression extends Expression {
  type: 'math';
  operator: keyof MathHelper;
  x: any;
  y: any;
}
export interface AsyncExpression extends StackExpression {
  type: 'async';
}
export interface ArgumentExpression extends Expression {
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

export interface IntermediateValue {
  $$type: string;
}
export interface StackValue extends IntermediateValue {
  $$type: 'stack';
  $$scope: number;
  $$stack: number;
}
export interface ClosureArgument extends IntermediateValue {
  $$type: 'closure';
  $$exps: Expression[];
}

export function getBrokerMessageType(targetKey: string) {
  return `agent.invoke.${targetKey}`;
}
