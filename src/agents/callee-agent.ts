import type { CalleeBroker } from '../brokers';
import {
  ClosureArgument,
  Expression,
  getBrokerMessageType,
  MixedExpression,
  ReferencedValue,
  ReturnExpression,
  SyncExpression,
  TargetExpression,
} from './agent';

function isTargetExpression(exp: Expression): exp is TargetExpression {
  return typeof (exp as TargetExpression)?.target === 'number';
}

function isRefValue(value: unknown): value is ReferencedValue {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as ReferencedValue).$$scope === 'number' &&
    typeof (value as ReferencedValue).$$var === 'number'
  );
}

function isClosureArgument(value: unknown): value is ClosureArgument {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as ClosureArgument).$$type === 'closure'
  );
}

interface CalleeAgentRunnerOptions {
  target?: any;
  scopeIndex: number;
  parentScope?: CalleeAgentRunner;
  params?: any[];
}
class CalleeAgentRunner {
  protected readonly stack: any[] = [];
  protected readonly scopeIndex: number;
  protected readonly target?: any;
  protected readonly parentScope?: CalleeAgentRunner;
  protected readonly params?: any[];

  constructor(options: CalleeAgentRunnerOptions) {
    this.target = options.target;
    this.scopeIndex = options.scopeIndex;
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
    const target = this.resolveTargetVar(exp);
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
              if (isClosureArgument(arg)) {
                return (...params: any[]) => {
                  const closure = new CalleeAgentRunner({
                    scopeIndex: this.scopeIndex + 1,
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
              value = NaN;
          }
        }
        break;
      case 'var':
        value = this.params?.[exp.index];
        break;
      default:
        throw new Error('Unknown expression');
    }
    this.stack.push(value);
  }

  async execAsync(exp: Exclude<MixedExpression, ReturnExpression>) {
    switch (exp.type) {
      case 'async':
        const target = this.resolveTargetVar(exp);
        this.stack.push(await target);
        break;
      default:
        this.execSync(exp);
        break;
    }
  }

  resolveScope(scope: number): CalleeAgentRunner {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let runner: CalleeAgentRunner = this;
    while (runner != null) {
      if (runner.scopeIndex === scope) {
        break;
      }
      runner = runner.parentScope;
    }
    return runner;
  }

  resolveTargetVar(exp: Expression) {
    if (isTargetExpression(exp)) {
      const runner = this.resolveScope(exp.scope);
      if (runner != null) {
        return exp.target >= 0 ? runner.stack[exp.target] : runner.target;
      }
    }
  }

  resolveValue(value: any): any {
    return value == null
      ? value
      : JSON.parse(JSON.stringify(value), (key, value) => {
          if (isRefValue(value)) {
            const runner = this.resolveScope(value.$$scope);
            return runner == null ? value : runner.stack[value.$$var];
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
    const runner = new CalleeAgentRunner({
      scopeIndex: 0,
      target: this.target,
    });
    const res = await runner.runAsync(payload);
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
