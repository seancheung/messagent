import type { CalleeBroker } from '../brokers';
import {
  Closure,
  Expression,
  getBrokerMessageType,
  IntermediateValue,
  MixedExpression,
  ReturnExpression,
  StackExpression,
  StackValue,
  SyncExpression,
} from './agent';

function isStackExpression(exp: Expression): exp is StackExpression {
  return typeof (exp as StackExpression)?.stack === 'number';
}

function isIntermediate(value: unknown): value is IntermediateValue {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as IntermediateValue).$$type === 'string'
  );
}

function isStackValue(value: unknown): value is StackValue {
  return isIntermediate(value) && value.$$type === 'stack';
}

function isClosure(value: unknown): value is Closure {
  return isIntermediate(value) && value.$$type === 'closure';
}

interface CalleeAgentScopeOptions {
  target?: any;
  scopeId: number;
  parentScope?: CalleeAgentScope;
  params?: any[];
}
class CalleeAgentScope {
  protected readonly stack: any[] = [];
  protected readonly scopeId: number;
  protected readonly target?: any;
  protected readonly parentScope?: CalleeAgentScope;
  protected readonly params?: any[];

  constructor(options: CalleeAgentScopeOptions) {
    this.target = options.target;
    this.scopeId = options.scopeId;
    this.parentScope = options.parentScope;
    this.params = options.params;
  }

  runSync(exps: SyncExpression[]) {
    for (const exp of exps) {
      if (exp.type === 'return') {
        return this.resolveValue(exp.value);
      }
      this.execSync(exp);
    }
  }

  async runAsync(exps: MixedExpression[]) {
    for (const exp of exps) {
      if (exp.type === 'return') {
        return this.resolveValue(exp.value);
      }
      await this.execAsync(exp);
    }
  }

  execSync(exp: Exclude<SyncExpression, ReturnExpression>) {
    const target = this.resolveStackValue(exp);
    let value: any;
    switch (exp.type) {
      case 'get':
        value = Reflect.get(target, exp.p, target);
        if (typeof value === 'function') {
          value = value.bind(target);
        }
        break;
      case 'set':
        value = Reflect.set(target, exp.p, this.resolveValue(exp.newValue));
        break;
      case 'del':
        value = Reflect.deleteProperty(target, exp.p);
        break;
      case 'apply':
        {
          let args: any[] = this.resolveValue(exp.args);
          if (args != null) {
            args = args.map((arg) => {
              if (isClosure(arg)) {
                return (...params: any[]) => {
                  const closure = new CalleeAgentScope({
                    scopeId: this.scopeId + 1,
                    parentScope: this,
                    params,
                  });
                  // NOTE: async callback is not supported
                  return closure.runSync(arg.$$exps as SyncExpression[]);
                };
              }
              return arg;
            });
          }
          value = Reflect.apply(target, undefined, args);
        }
        break;
      case 'new':
        value = Reflect.construct(target, this.resolveValue(exp.args));
        break;
      case 'math':
        {
          const [x, y] = this.resolveValue([exp.x, exp.y]);
          switch (exp.operator) {
            case 'add':
              value = x + y;
              break;
            case 'subtract':
              value = x - y;
              break;
            case 'multiply':
              value = x * y;
              break;
            case 'divide':
              value = x / y;
              break;
            default:
              throw new Error('Unknown math operator');
          }
        }
        break;
      case 'arg':
        value = this.params?.[exp.index];
        break;
      case 'declare':
        value = this.resolveValue(exp.value);
        break;
      case 'assign':
        {
          const scope = this.resolveScope(exp.varScope);
          if (scope && exp.varStack >= 0 && exp.varStack < scope.stack.length) {
            scope.stack[exp.varStack] = this.resolveValue(exp.newValue);
          }
        }
        break;
      case 'if':
        {
          if (isClosure(exp.then)) {
            const cond = this.resolveValue(exp.cond);
            if (cond) {
              const closure = new CalleeAgentScope({
                scopeId: this.scopeId + 1,
                parentScope: this,
              });
              closure.runSync(exp.then.$$exps as SyncExpression[]);
            } else if (isClosure(exp.else)) {
              const closure = new CalleeAgentScope({
                scopeId: this.scopeId + 1,
                parentScope: this,
              });
              closure.runSync(exp.else.$$exps as SyncExpression[]);
            }
          }
        }
        break;
      case 'compare':
        {
          const [x, y] = this.resolveValue([exp.x, exp.y]);
          switch (exp.operator) {
            case 'eq':
              value = exp.strict ? x === y : x == y;
              break;
            case 'gt':
              value = x > y;
              break;
            case 'gte':
              value = x >= y;
              break;
            case 'lt':
              value = x < y;
              break;
            case 'lte':
              value = x <= y;
              break;
            default:
              throw new Error('Unknown compare operator');
          }
        }
        break;
      case 'check':
        {
          const val = this.resolveValue(exp.value);
          switch (exp.operator) {
            case 'isNull':
              value = val == null;
              break;
            case 'isUndefined':
              value = typeof val === 'undefined';
              break;
            case 'isString':
              value = typeof val === 'string';
              break;
            case 'isNumber':
              value = typeof val === 'number';
              break;
            case 'isBoolean':
              value = typeof val === 'boolean';
              break;
            case 'isObject':
              value = typeof val === 'object';
              break;
            case 'isFunction':
              value = typeof val === 'function';
              break;
            case 'isNaN':
              value = isNaN(val);
              break;
            case 'not':
              value = !val;
              break;
            case 'notNot':
              value = !!val;
              break;
            case '$typeof':
              value = typeof val;
              break;
            default:
              throw new Error('Unknown check operator');
          }
        }
        break;
      default:
        throw new Error('Unknown expression');
    }
    this.stack.push(value);
  }

  async execAsync(exp: Exclude<MixedExpression, ReturnExpression>) {
    switch (exp.type) {
      case 'async':
        const target = this.resolveStackValue(exp);
        this.stack.push(await target);
        break;
      default:
        this.execSync(exp);
        break;
    }
  }

  resolveScope(id: number): CalleeAgentScope {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let scope: CalleeAgentScope = this;
    while (scope != null) {
      if (scope.scopeId === id) {
        break;
      }
      scope = scope.parentScope;
    }
    return scope;
  }

  resolveStackValue(exp: Expression) {
    if (isStackExpression(exp)) {
      const scope = this.resolveScope(exp.scope);
      if (scope != null) {
        return exp.stack >= 0 ? scope.stack[exp.stack] : scope.target;
      }
    }
  }

  resolveValue(value: any): any {
    return value == null
      ? value
      : JSON.parse(JSON.stringify(value), (key, value) => {
          if (isStackValue(value)) {
            const scope = this.resolveScope(value.$$scope);
            return scope == null ? value : scope.stack[value.$$stack];
          }
          return value;
        });
  }
}

export class CalleeAgent {
  protected readonly targetKey: string;
  protected readonly broker: CalleeBroker;

  constructor(protected readonly target: any, options: CalleeAgent.Options) {
    this.targetKey = options.targetKey;
    this.broker = options.broker;
  }

  protected onMessage: CalleeBroker.MessageHandler = async (
    _,
    payload: MixedExpression[],
  ) => {
    const scope = new CalleeAgentScope({
      scopeId: 0,
      target: this.target,
    });
    const res = await scope.runAsync(payload);
    return res;
  };

  inject(): void {
    this.broker.setHandler(
      getBrokerMessageType(this.targetKey),
      this.onMessage,
    );
  }

  eject(): void {
    this.broker.removeHandler(getBrokerMessageType(this.targetKey));
  }
}
export namespace CalleeAgent {
  export interface Options {
    targetKey: string;
    broker: CalleeBroker;
  }
}
