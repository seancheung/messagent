import { JSONArray } from '../adapters';
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
  MathHelper,
  ReturnExpression,
  SetExpression,
  StackExpression,
  StackValue,
} from './agent';

const CallableTarget = function () {};

function createProxy(handler: CallerAgentProxyHandler) {
  return new Proxy(CallableTarget, handler);
}

function createMathHelper(scopeRef: RefObject<CallerAgentScope>): MathHelper {
  const operators: (keyof MathHelper)[] = [
    'add',
    'subtract',
    'multiply',
    'divide',
  ];
  return Object.fromEntries(
    operators.map((operator) => [
      operator,
      (x: number, y: number) => {
        const scope = scopeRef.current;
        if (!scope) {
          throw new Error(
            `Math.${operator} must be used inside Agent callback function`,
          );
        }
        const stackRef = scope.pushToStack<MathExpression>({
          type: 'math',
          operator,
          x,
          y,
        });
        return createProxy(
          new CallerAgentProxyHandler(scopeRef, { ...stackRef }),
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

class CallerAgentScope {
  readonly id: number;
  readonly stack: Expression[] = [];

  /**
   * Create a new Scope
   * @param id Scope ID
   */
  constructor(id: number) {
    this.id = id;
  }

  /**
   * Push the expression to the stack in this scope
   * @param exp Expression partial
   * @returns StackRef object
   */
  pushToStack<T extends Expression>(exp: T): StackRef {
    this.stack.push(exp);
    return {
      scopeId: this.id,
      stackId: this.stack.length - 1,
    };
  }

  /**
   * Get normalized stack array
   * @returns Normalized stack array
   * @description This will call `toJSON` on each intermediate object
   */
  printStack(): JSONArray {
    return JSON.parse(JSON.stringify(this.stack));
  }
}

interface StackRef {
  scopeId: number;
  stackId: number;
}

interface CallerAgentProxyHandlerOptions
  extends CallerAgentProxyHandlerOverridableOptions {
  scopeId: number;
  stackId: number;
}
interface CallerAgentProxyHandlerOverridableOptions {
  isResolved?: boolean;
}
class CallerAgentProxyHandler implements ProxyHandler<any> {
  protected readonly scopeRef: RefObject<CallerAgentScope>;
  protected readonly scopeId: number;
  protected readonly stackId: number;
  protected readonly isResolved?: boolean;

  constructor(
    scopeRef: RefObject<CallerAgentScope>,
    options: CallerAgentProxyHandlerOptions,
  ) {
    this.scopeRef = scopeRef;
    this.scopeId = options.scopeId;
    this.stackId = options.stackId;
    this.isResolved = options.isResolved;
  }

  protected pushToStack<T extends StackExpression>(
    exp: Omit<T, Exclude<keyof StackExpression, keyof Expression>>,
    options?: CallerAgentProxyHandlerOverridableOptions,
  ): any {
    const scope = this.scopeRef.current;
    const next = scope.pushToStack({
      ...exp,
      stack: this.stackId,
      scope: this.scopeId,
    });
    return createProxy(
      new CallerAgentProxyHandler(this.scopeRef, {
        ...next,
        ...options,
      }),
    );
  }

  protected useScope(scope: CallerAgentScope, func: () => void) {
    const prevScope = this.scopeRef.current;
    this.scopeRef.current = scope;
    func();
    this.scopeRef.current = prevScope;
  }

  protected createClosure(func: (...args: any[]) => any) {
    const len = func.length;
    const scopeId = this.scopeRef.current.id + 1;
    const scope = new CallerAgentScope(scopeId);
    const args = Array(len)
      .fill(null)
      .map((_, i) => {
        const stackRef = scope.pushToStack<ArgumentExpression>({
          type: 'var',
          index: i,
        });
        return createProxy(
          new CallerAgentProxyHandler(this.scopeRef, {
            ...stackRef,
          }),
        );
      });
    // NOTE: for context hook usage
    let returnValue: any;
    this.useScope(scope, () => {
      returnValue = func(...args);
    });
    const returnExp: ReturnExpression = {
      type: 'return',
      value: returnValue,
    };
    scope.stack.push(returnExp);
    const closure: ClosureArgument = {
      $$type: 'closure',
      $$exps: scope.stack,
    };
    return closure;
  }

  protected toPromise(
    resolve: (value: any) => any,
    reject: (reason: any) => any,
  ) {
    const stackRef = this.pushToStack<AsyncExpression>(
      {
        type: 'async',
      },
      { isResolved: true },
    );
    return Promise.resolve(stackRef).then(resolve).catch(reject);
  }

  protected toJSON(): StackValue {
    return {
      $$type: 'stack',
      $$scope: this.scopeId,
      $$stack: this.stackId,
    };
  }

  toProxy() {
    return createProxy(this);
  }

  get(target: any, p: string | symbol) {
    if (typeof p === 'symbol') {
      return Reflect.get(this, p, this);
    }
    if (p === 'then') {
      if (this.isResolved) {
        return;
      }
      return this.toPromise.bind(this);
    }
    if (p === 'toJSON') {
      return this.toJSON.bind(this);
    }
    return this.pushToStack<GetExpression>({
      type: 'get',
      p,
    });
  }

  set(target: any, p: string | symbol, newValue: any): boolean {
    if (typeof p === 'symbol') {
      return Reflect.set(this, p, newValue, this);
    }
    this.pushToStack<SetExpression>({ type: 'set', p, newValue });
    // NOTE: always true since the actual execution is deferred
    return true;
  }

  deleteProperty(target: any, p: string | symbol): boolean {
    if (typeof p === 'symbol') {
      return Reflect.deleteProperty(this, p);
    }
    this.pushToStack<DelExpression>({ type: 'del', p });
    // NOTE: always true since the actual execution is deferred
    return true;
  }

  construct(target: any, argArray: any[]): object {
    return this.pushToStack<ConstructExpression>({
      type: 'new',
      args: argArray,
    });
  }

  apply(target: any, thisArg: any, argArray: any[]) {
    if (argArray != null) {
      argArray = argArray.map((arg) => {
        if (arg instanceof CallerAgentProxyHandler) {
          return arg;
        }
        if (typeof arg === 'function') {
          // NOTE: Proxy type is the same as CallableTarget
          return this.createClosure(arg);
        }
        return arg;
      });
    }
    return this.pushToStack<ApplyExpression>({ type: 'apply', args: argArray });
  }

  getPrototypeOf(): object {
    return Reflect.getPrototypeOf(this);
  }
}

interface RefObject<T> {
  current: T;
}
export class CallerAgent {
  protected readonly targetKey: string;
  protected readonly broker: CallerBroker;
  protected readonly handler: CallerAgentProxyHandler;
  protected scope: CallerAgentScope;
  protected scopeRef: RefObject<CallerAgentScope>;

  constructor(options: CallerAgent.Options) {
    this.targetKey = options.targetKey;
    this.broker = options.broker;
    this.scope = new CallerAgentScope(0);
    this.scopeRef = { current: this.scope };
    this.handler = new CallerAgentProxyHandler(this.scopeRef, {
      scopeId: this.scope.id,
      stackId: -1,
    });
  }

  getProxiedTarget() {
    return this.handler.toProxy();
  }

  getMathObject() {
    return createMathHelper(this.scopeRef);
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
      this.scope.stack.push(exp);
    }
    const payload = this.scope.printStack();
    console.log(JSON.stringify(payload));
    return this.broker.request({
      type: getBrokerMessageType(this.targetKey),
      payload,
    });
  }
}
export namespace CallerAgent {
  export interface Options {
    targetKey: string;
    broker: CallerBroker;
  }
}
