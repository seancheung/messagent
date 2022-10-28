import { JSONArray } from '../adapters';
import type { CallerBroker } from '../brokers';
import {
  ApplyExpression,
  ArgumentExpression,
  AssignExpression,
  AsyncExpression,
  Closure,
  CompareExpression,
  CompareHelper,
  ConstructExpression,
  DeclareExpression,
  DelExpression,
  Expression,
  getBrokerMessageType,
  GetExpression,
  IfExpression,
  LogicFlowHelper,
  MathExpression,
  MathHelper,
  ReturnExpression,
  SetExpression,
  StackExpression,
  StackValue,
  ValueCheckExpression,
  ValueCheckHelper,
  VariableHelper,
} from './agent';

const CallableTarget = function () {};

class CallerAgentScope {
  readonly id: number;
  readonly syntaxTree: Expression[] = [];

  /**
   * Create a new Scope
   * @param id Scope ID
   */
  constructor(id: number) {
    this.id = id;
  }

  /**
   * Add the expression to the syntax tree in this scope
   * @param exp Expression partial
   * @returns StackRef object
   */
  addExpression<T extends Expression>(exp: T): StackRef {
    this.syntaxTree.push(exp);
    return {
      scopeId: this.id,
      stackId: this.syntaxTree.length - 1,
    };
  }

  /**
   * Get normalized syntax tree
   * @returns Normalized syntax tree
   * @description This will call `toJSON` on each intermediate object
   */
  printTree(): JSONArray {
    return JSON.parse(JSON.stringify(this.syntaxTree));
  }
}

interface StackRef {
  /**
   * Scope index the value
   */
  scopeId: number;
  /**
   * Stack index of the value
   */
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

  protected addExpression<T extends StackExpression>(
    exp: Omit<T, Exclude<keyof StackExpression, keyof Expression>>,
    options?: CallerAgentProxyHandlerOverridableOptions,
  ): any {
    const scope = this.scopeRef.current;
    const nextRef = scope.addExpression({
      ...exp,
      stack: this.stackId,
      scope: this.scopeId,
    });
    return createProxy(
      new CallerAgentProxyHandler(this.scopeRef, {
        ...nextRef,
        ...options,
      }),
    );
  }

  protected toPromise(
    resolve: (value: any) => any,
    reject: (reason: any) => any,
  ) {
    const nextProxy = this.addExpression<AsyncExpression>(
      {
        type: 'async',
      },
      { isResolved: true },
    );
    return Promise.resolve(nextProxy).then(resolve).catch(reject);
  }

  toJSON(): StackValue {
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
    return this.addExpression<GetExpression>({
      type: 'get',
      p,
    });
  }

  set(target: any, p: string | symbol, newValue: any): boolean {
    if (typeof p === 'symbol') {
      return Reflect.set(this, p, newValue, this);
    }
    this.addExpression<SetExpression>({ type: 'set', p, newValue });
    // NOTE: always true since the actual execution is deferred
    return true;
  }

  deleteProperty(target: any, p: string | symbol): boolean {
    if (typeof p === 'symbol') {
      return Reflect.deleteProperty(this, p);
    }
    this.addExpression<DelExpression>({ type: 'del', p });
    // NOTE: always true since the actual execution is deferred
    return true;
  }

  construct(target: any, argArray: any[]): object {
    return this.addExpression<ConstructExpression>({
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
          return createClosure(this.scopeRef, arg);
        }
        return arg;
      });
    }
    return this.addExpression<ApplyExpression>({
      type: 'apply',
      args: argArray,
    });
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

  getHelpers(): CallerAgent.Helpers {
    return {
      Math: createMathHelper(this.scopeRef),
      ...createVariableHelper(this.scopeRef),
      ...createCompareHelper(this.scopeRef),
      ...createValueCheckHelper(this.scopeRef),
      ...createLogicFlowHelper(this.scopeRef),
    };
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
      this.scope.syntaxTree.push(exp);
    }
    const payload = this.scope.printTree();
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
  export interface Helpers
    extends VariableHelper,
      CompareHelper,
      ValueCheckHelper,
      LogicFlowHelper {
    Math: MathHelper;
  }
}

function isPromise(value: unknown): value is Promise<any> {
  return (
    typeof value != null &&
    typeof value == 'object' &&
    !(value instanceof CallerAgentProxyHandler) &&
    typeof (value as Promise<any>).then === 'function'
  );
}

function createProxy(handler: CallerAgentProxyHandler) {
  return new Proxy(CallableTarget, handler);
}

function useScope(
  scopeRef: RefObject<CallerAgentScope>,
  scope: CallerAgentScope,
  func: () => void,
) {
  const prevScope = scopeRef.current;
  scopeRef.current = scope;
  func();
  scopeRef.current = prevScope;
}

function createClosure(
  scopeRef: RefObject<CallerAgentScope>,
  func: (...args: any[]) => any,
): Closure {
  const len = func.length;
  const scopeId = scopeRef.current.id + 1;
  const scope = new CallerAgentScope(scopeId);
  const args = Array(len)
    .fill(null)
    .map((_, i) => {
      const stackRef = scope.addExpression<ArgumentExpression>({
        type: 'arg',
        index: i,
      });
      return createProxy(
        new CallerAgentProxyHandler(scopeRef, {
          ...stackRef,
        }),
      );
    });
  // NOTE: for context hook usage
  let returnValue: any;
  useScope(scopeRef, scope, () => {
    returnValue = func(...args);
  });
  const returnExp: ReturnExpression = {
    type: 'return',
    value: returnValue,
  };
  scope.syntaxTree.push(returnExp);
  const closure: Closure = {
    $$type: 'closure',
    $$exps: scope.syntaxTree,
    $$async: isPromise(returnValue),
  };
  return closure;
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
            `\`Math.${operator}\` must be used inside Agent function`,
          );
        }
        const stackRef = scope.addExpression<MathExpression>({
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

function createVariableHelper(
  scopeRef: RefObject<CallerAgentScope>,
): VariableHelper {
  return {
    declareVar: (initialValue) => {
      const scope = scopeRef.current;
      if (!scope) {
        throw new Error('`declareVar` must be used inside Agent function');
      }
      const stackRef = scope.addExpression<DeclareExpression>({
        type: 'declare',
        value: initialValue,
      });
      return createProxy(
        new CallerAgentProxyHandler(scopeRef, { ...stackRef }),
      );
    },
    assignVar: (variable, newValue) => {
      const scope = scopeRef.current;
      if (!scope) {
        throw new Error('`assignVar` must be used inside Agent function');
      }
      if (!(variable instanceof CallerAgentProxyHandler)) {
        throw new Error('target variable is not assignable');
      }
      const { $$scope: varScope, $$stack: varStack } = variable.toJSON();
      const stackRef = scope.addExpression<AssignExpression>({
        type: 'assign',
        varScope,
        varStack,
        newValue,
      });
      return createProxy(
        new CallerAgentProxyHandler(scopeRef, { ...stackRef }),
      );
    },
  };
}

function createCompareHelper(
  scopeRef: RefObject<CallerAgentScope>,
): CompareHelper {
  const operators: (keyof CompareHelper)[] = ['eq', 'gt', 'gte', 'lt', 'lte'];
  return Object.fromEntries(
    operators.map((operator) => [
      operator,
      (x: number, y: number, strict?: boolean) => {
        const scope = scopeRef.current;
        if (!scope) {
          throw new Error(`\`${operator}\` must be used inside Agent function`);
        }
        const stackRef = scope.addExpression<CompareExpression>({
          type: 'compare',
          operator,
          x,
          y,
          strict,
        });
        return createProxy(
          new CallerAgentProxyHandler(scopeRef, { ...stackRef }),
        );
      },
    ]),
  ) as any;
}

function createValueCheckHelper(
  scopeRef: RefObject<CallerAgentScope>,
): ValueCheckHelper {
  const operators: (keyof ValueCheckHelper)[] = [
    'isNull',
    'isUndefined',
    'isString',
    'isNumber',
    'isBoolean',
    'isObject',
    'isFunction',
    'isNaN',
    'not',
    'notNot',
    '$typeof',
  ];
  return Object.fromEntries(
    operators.map((operator) => [
      operator,
      (value: any) => {
        const scope = scopeRef.current;
        if (!scope) {
          throw new Error(`\`${operator}\` must be used inside Agent function`);
        }
        const stackRef = scope.addExpression<ValueCheckExpression>({
          type: 'check',
          operator,
          value,
        });
        return createProxy(
          new CallerAgentProxyHandler(scopeRef, { ...stackRef }),
        );
      },
    ]),
  ) as any;
}

function createLogicFlowHelper(
  scopeRef: RefObject<CallerAgentScope>,
): LogicFlowHelper {
  return {
    $if: (cond, $then, $else) => {
      const scope = scopeRef.current;
      if (!scope) {
        throw new Error('`$if` must be used inside Agent function');
      }
      const stackRef = scope.addExpression<IfExpression>({
        type: 'if',
        cond,
        then: createClosure(scopeRef, $then),
        else: $else == null ? undefined : createClosure(scopeRef, $else),
      });
      return createProxy(
        new CallerAgentProxyHandler(scopeRef, { ...stackRef }),
      );
    },
  };
}
