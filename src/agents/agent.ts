export interface MathHelper {
  add(x: number, y: number): number;
  subtract(x: number, y: number): number;
  multiply(x: number, y: number): number;
  divide(x: number, y: number): number;
}
export interface VariableHelper {
  declareVar<T = any>(initialValue?: T): T;
  assignVar<T>(variable: T, newValue: T): void;
}
export interface LogicFlowHelper {
  $if(cond: boolean, $then: () => void, $else?: () => void): void;
}
export interface CompareHelper {
  eq(x: any, y: any, strict?: boolean): boolean;
  gt(x: number, y: number): boolean;
  gte(x: number, y: number): boolean;
  lt(x: number, y: number): boolean;
  lte(x: number, y: number): boolean;
}
export interface ValueCheckHelper {
  isNull(value: any): value is null;
  isUndefined(value: any): value is undefined;
  isString(value: any): value is string;
  isNumber(value: any): value is number;
  isBoolean(value: any): value is boolean;
  isObject(value: any): value is object;
  // eslint-disable-next-line @typescript-eslint/ban-types
  isFunction(value: any): value is Function;
  isNaN(value: any): boolean;
  not(value: any): boolean;
  notNot(value: any): boolean;
  $typeof(
    value: any,
  ):
    | 'string'
    | 'number'
    | 'bigint'
    | 'boolean'
    | 'symbol'
    | 'undefined'
    | 'object'
    | 'function';
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
  type: 'arg';
  index: number;
}
export interface DeclareExpression extends Expression {
  type: 'declare';
  value?: any;
}
export interface AssignExpression extends Expression {
  type: 'assign';
  varScope: number;
  varStack: number;
  newValue?: any;
}
export interface CompareExpression extends Expression {
  type: 'compare';
  operator: keyof CompareHelper;
  x: any;
  y: any;
  strict?: boolean;
}
export interface ValueCheckExpression extends Expression {
  type: 'check';
  operator: keyof ValueCheckHelper;
  value: any;
}
export interface IfExpression extends Expression {
  type: 'if';
  cond: any;
  then: Closure;
  else?: Closure;
}
export type SyncExpression =
  | GetExpression
  | SetExpression
  | DelExpression
  | ConstructExpression
  | ApplyExpression
  | ReturnExpression
  | MathExpression
  | ArgumentExpression
  | DeclareExpression
  | AssignExpression
  | CompareExpression
  | ValueCheckExpression
  | IfExpression;
export type MixedExpression = SyncExpression | AsyncExpression;

export interface IntermediateValue {
  $$type: string;
}
export interface StackValue extends IntermediateValue {
  $$type: 'stack';
  $$scope: number;
  $$stack: number;
}
export interface Closure extends IntermediateValue {
  $$type: 'closure';
  $$exps: Expression[];
  $$async?: boolean;
}

export function getBrokerMessageType(targetKey: string) {
  return `agent.invoke.${targetKey}`;
}
