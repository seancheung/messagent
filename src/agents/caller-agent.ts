import type { CallerBroker } from '../brokers';
import {
  ApplyExpression,
  ArgumentExpression,
  AsyncExpression,
  ClosureArgument,
  ConstructExpression,
  DelExpression,
  Expression,
  getBrokerMessageType,
  GetExpression,
  MathExpression,
  MathObject,
  ReferencedValue,
  ReturnExpression,
  SetExpression,
} from './agent';

const CallableTarget = function () {};

function createProxy(handler: CallerAgentProxyHandler) {
  return new Proxy(CallableTarget, handler);
}

function createMathObject(handler: CallerAgentProxyHandler): MathObject {
  const operators: (keyof MathObject)[] = [
    'add',
    'subtract',
    'multiply',
    'divide',
  ];
  return Object.fromEntries(
    operators.map((operator) => [
      operator,
      (x: number, y: number) => {
        const context = handler.getCurrentContext();
        const exp: MathExpression = {
          type: 'math',
          operator,
          x,
          y,
          scope: context.scopeIndex,
        };
        context.stack.push(exp);
        return createProxy(
          new CallerAgentProxyHandler(context, {
            stackIndex: context.stack.length - 1,
          }),
        );
      },
    ]),
  ) as any;
}

function isPromise(value: unknown): value is Promise<any> {
  return (
    typeof value != null &&
    typeof value == 'object' &&
    !(value instanceof CallerAgentProxyHandler) &&
    typeof (value as Promise<any>).then === 'function'
  );
}

class CallerAgentContext {
  readonly scopeIndex: number;
  readonly stack: Expression[];

  constructor(options: CallerAgentContext) {
    this.scopeIndex = options.scopeIndex;
    this.stack = options.stack;
  }
}

interface CallerAgentProxyHandlerOptions {
  stackIndex: number;
  isResolved?: boolean;
}
class CallerAgentProxyHandler implements ProxyHandler<any> {
  protected readonly context: CallerAgentContext;
  private readonly _stackIndex: number;
  private readonly _isResolved: boolean;
  private _currentContext: CallerAgentContext;

  constructor(
    context: CallerAgentContext,
    options: CallerAgentProxyHandlerOptions,
  ) {
    this.context = context;
    this._stackIndex = options.stackIndex;
    this._isResolved = options.isResolved;
    this._currentContext = this.context;
  }

  protected toStackVar = (options: CallerAgentProxyHandlerOptions) => {
    return createProxy(new CallerAgentProxyHandler(this.context, options));
  };

  protected toClosure = (func: (...args: any[]) => any) => {
    const len = func.length;
    const scopeIndex = this.context.scopeIndex + 1;
    const stack: Expression[] = Array(len)
      .fill(null)
      .map<ArgumentExpression>((_, i) => ({
        type: 'var',
        scope: scopeIndex,
        index: i,
      }));
    const context = new CallerAgentContext({
      scopeIndex,
      stack,
    });
    const args = stack.map((_, i) =>
      createProxy(new CallerAgentProxyHandler(context, { stackIndex: i })),
    );
    // NOTE: for context hook usage
    this._currentContext = context;
    const returnValue = func(...args);
    this._currentContext = context;
    const returnExp: ReturnExpression = {
      type: 'return',
      value: returnValue,
    };
    stack.push(returnExp);
    const closure: ClosureArgument = {
      $$type: 'closure',
      $$exps: stack,
    };
    return closure;
  };

  protected toAsync = (
    resolve: (value: any) => any,
    reject: (reason: any) => any,
  ) => {
    const { scopeIndex, stack } = this.context;
    const exp: AsyncExpression = {
      type: 'async',
      scope: scopeIndex,
      target: this._stackIndex,
    };
    stack.push(exp);
    return Promise.resolve(
      this.toStackVar({
        stackIndex: stack.length - 1,
        isResolved: true,
      }),
    )
      .then(resolve)
      .catch(reject);
  };

  protected toRef = (): ReferencedValue => {
    return {
      $$scope: this.context.scopeIndex,
      $$var: this._stackIndex,
    };
  };

  getCurrentContext() {
    return this._currentContext;
  }

  getProxy() {
    return createProxy(this);
  }

  get(target: any, p: string | symbol) {
    if (typeof p === 'symbol') {
      return Reflect.get(this, p, this);
    }
    if (p === 'then') {
      if (this._isResolved) {
        return;
      }
      return this.toAsync;
    }
    if (p === 'toJSON') {
      return this.toRef;
    }
    const { scopeIndex, stack } = this.context;
    const exp: GetExpression = {
      type: 'get',
      p,
      scope: scopeIndex,
      target: this._stackIndex,
    };
    stack.push(exp);
    return this.toStackVar({
      stackIndex: stack.length - 1,
    });
  }

  set(target: any, p: string | symbol, newValue: any): boolean {
    if (typeof p === 'symbol') {
      return Reflect.set(this, p, newValue, this);
    }
    const { scopeIndex, stack } = this.context;
    const exp: SetExpression = {
      type: 'set',
      p,
      newValue,
      scope: scopeIndex,
      target: this._stackIndex,
    };
    stack.push(exp);
    // NOTE: always true since the actual execution is deferred
    return true;
  }

  deleteProperty(target: any, p: string | symbol): boolean {
    if (typeof p === 'symbol') {
      return Reflect.deleteProperty(this, p);
    }
    const { scopeIndex, stack } = this.context;
    const exp: DelExpression = {
      type: 'del',
      p,
      scope: scopeIndex,
      target: this._stackIndex,
    };
    stack.push(exp);
    // NOTE: always true since the actual execution is deferred
    return true;
  }

  construct(target: any, argArray: any[]): object {
    const { scopeIndex, stack } = this.context;
    const exp: ConstructExpression = {
      type: 'new',
      args: argArray,
      scope: scopeIndex,
      target: this._stackIndex,
    };
    stack.push(exp);
    return this.toStackVar({ stackIndex: stack.length - 1 });
  }

  apply(target: any, thisArg: any, argArray: any[]) {
    const { scopeIndex, stack } = this.context;
    if (argArray != null) {
      argArray = argArray.map((arg) => {
        if (arg instanceof CallerAgentProxyHandler) {
          return arg;
        }
        if (typeof arg === 'function') {
          // NOTE: Proxy type is the same as CallableTarget
          return this.toClosure(arg);
        }
        return arg;
      });
    }
    const exp: ApplyExpression = {
      type: 'apply',
      args: argArray,
      scope: scopeIndex,
      target: this._stackIndex,
    };
    stack.push(exp);
    return this.toStackVar({
      stackIndex: stack.length - 1,
    });
  }

  getPrototypeOf(): object {
    return Reflect.getPrototypeOf(this);
  }
}

export class CallerAgent {
  protected readonly targetKey: string;
  protected readonly broker: CallerBroker;
  protected readonly expressions: Expression[];
  protected readonly handler: CallerAgentProxyHandler;

  constructor(options: CallerAgent.Options) {
    this.targetKey = options.targetKey;
    this.broker = options.broker;
    this.expressions = [];
    this.handler = new CallerAgentProxyHandler(
      new CallerAgentContext({
        scopeIndex: 0,
        stack: this.expressions,
      }),
      { stackIndex: -1 },
    );
  }

  getProxiedTarget() {
    return this.handler.getProxy();
  }

  getMathObject() {
    return createMathObject(this.handler);
  }

  async resolve(ret?: any): Promise<any> {
    if (ret !== undefined) {
      if (isPromise(ret)) {
        ret = await ret;
      }
      const exp: ReturnExpression = {
        type: 'return',
        value: ret,
      };
      this.expressions.push(exp);
    }
    return this.broker.request({
      type: getBrokerMessageType(this.targetKey),
      payload: this.expressions,
    });
  }
}
export namespace CallerAgent {
  export interface Options {
    targetKey: string;
    broker: CallerBroker;
  }
}
