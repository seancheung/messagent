import { CalleeBroker, CallerBroker, WindowAdapter } from '../../src';

describe('test agents', () => {
  let calleeBroker: CalleeBroker;
  let callerBroker: CallerBroker;

  beforeAll(() => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const ns = 'test';
    calleeBroker = new CalleeBroker({
      adapter: new WindowAdapter(ns, frame.contentWindow!, window),
    });
    callerBroker = new CallerBroker({
      adapter: new WindowAdapter(
        ns,
        frame.contentWindow!.parent,
        frame.contentWindow!,
      ),
    });
  });

  afterEach(() => {
    calleeBroker?.reset();
    callerBroker?.reset();
  });

  afterAll(() => {
    calleeBroker?.dispose();
    callerBroker?.dispose();
  });

  test('test get', async () => {
    const agentKey = 'test-get';
    const value = 1;
    class TestCallee {
      id = value;
    }
    calleeBroker.injectAgent(agentKey, new TestCallee());
    const res = await callerBroker.useAgent<TestCallee, number>(
      agentKey,
      async (target) => {
        return target.id;
      },
    );
    expect(res).toEqual(value);
  });

  test('test set', async () => {
    const agentKey = 'test-set';
    const value = 1;
    class TestCallee {
      id: number;
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original);
    expect(original.id).toBeUndefined();
    await callerBroker.useAgent<TestCallee>(agentKey, (target) => {
      target.id = value;
    });
    expect(original.id).toEqual(value);
  });

  test('test apply', async () => {
    const agentKey = 'test-apply';
    const value = 1;
    class TestCallee {
      run() {
        return value;
      }
    }
    calleeBroker.injectAgent(agentKey, new TestCallee());
    const res = await callerBroker.useAgent<TestCallee, number>(
      agentKey,
      (target) => {
        return target.run();
      },
    );
    expect(res).toEqual(value);
  });

  test('test deep', async () => {
    const agentKey = 'test-deep';
    class NestedCallee {
      id: number;
      constructor(id: number) {
        this.id = id;
      }
    }
    class TestCallee {
      item: NestedCallee = new NestedCallee(1);
      items = [new NestedCallee(2)];
      spawn(id: number) {
        this.items.push(new NestedCallee(id));
      }
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original);
    expect(
      await callerBroker.useAgent<TestCallee, number>(agentKey, (target) => {
        return target.item.id;
      }),
    ).toEqual(1);
    expect(
      await callerBroker.useAgent<TestCallee, NestedCallee>(
        agentKey,
        (target) => {
          return target.item;
        },
      ),
    ).toEqual({ id: 1 });
    expect(
      await callerBroker.useAgent<TestCallee, NestedCallee[]>(
        agentKey,
        (target) => {
          return target.items;
        },
      ),
    ).toBeInstanceOf(Array);
    await callerBroker.useAgent<TestCallee>(agentKey, (target) => {
      target.spawn(3);
    });
    expect(original.items.length).toEqual(2);
    await callerBroker.useAgent<TestCallee>(agentKey, (target) => {
      target.items.splice(0, target.items.length);
    });
    expect(original.items.length).toEqual(0);
  });

  test('test batch', async () => {
    const agentKey = 'test-batch';
    class NestedCallee {
      id: number;
      constructor(id: number) {
        this.id = id;
      }
    }
    class TestCallee {
      items: NestedCallee[] = [];
      spawn(id: number) {
        return new NestedCallee(id);
      }
      Item = NestedCallee;
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original);
    const count = await callerBroker.useAgent<TestCallee, number>(
      agentKey,
      (target) => {
        const item1 = target.spawn(1);
        const item2 = target.spawn(2);
        target.items.push(item1, item2);
        item2.id = 3;
        const item3 = new target.Item(4);
        target.items.push(item3);
        return target.items.length;
      },
    );
    expect(count).toEqual(3);
    expect(count).toEqual(original.items.length);
    expect(original.items[1].id).toEqual(3);
    expect(original.items[2].id).toEqual(4);
  });

  test('test async', async () => {
    const agentKey = 'test-async';
    class TestCallee {
      async calc(num: number) {
        return 2 * num;
      }
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original);
    const res = await callerBroker.useAgent<TestCallee, Promise<number>>(
      agentKey,
      async (target) => {
        const num = await target.calc(2);
        return target.calc(num);
      },
    );
    expect(res).toEqual(8);
  });

  test('test math', async () => {
    const agentKey = 'test-math';
    class TestCallee {
      x = 1;
      y = 2;
      z = 0;
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original);
    const res = await callerBroker.useAgent<TestCallee, number>(
      agentKey,
      (target, { Math }) => {
        target.x = Math.add(target.x, 1);
        target.y = Math.subtract(target.y, 1);
        target.z = Math.divide(target.x, target.y);
        return Math.multiply(2, target.z);
      },
    );
    expect(original.x).toEqual(2);
    expect(original.y).toEqual(1);
    expect(original.z).toEqual(2);
    expect(res).toEqual(4);
  });

  test('test callback', async () => {
    const agentKey = 'test-callback';
    class TestCallee {
      items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      list = [{ items: [1, 2, 3] }, { items: [4, 5, 6] }];
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original);
    const res = await callerBroker.useAgent<TestCallee, number[]>(
      agentKey,
      (target) => {
        return target.items.map((item) => item.id);
      },
    );
    expect(res).toEqual(original.items.map((item) => item.id));
    await callerBroker.useAgent<TestCallee>(agentKey, (target, { Math }) => {
      target.items.forEach((item) => {
        item.id = Math.multiply(item.id, 2);
      });
    });
    expect(original.items).toEqual([{ id: 2 }, { id: 4 }, { id: 6 }]);
    const sum = await callerBroker.useAgent<TestCallee, number>(
      agentKey,
      (target, { Math }) => {
        return target.list.reduce(
          (a, b) =>
            Math.add(
              a,
              b.items.reduce((a, b) => Math.add(a, b), 0),
            ),
          0,
        );
      },
    );
    expect(sum).toEqual(
      original.list.reduce((a, b) => a + b.items.reduce((a, b) => a + b, 0), 0),
    );
  });

  test('test scope', async () => {
    const agentKey = 'test-scope';
    interface Item {
      value: number;
    }
    class TestCallee {
      items: Item[] = [{ value: 1 }, { value: 2 }, { value: 3 }];
      bump(item: Item) {
        item.value++;
      }
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original);
    await callerBroker.useAgent<TestCallee>(agentKey, (target) => {
      target.items.forEach((item) => {
        target.bump(item);
      });
    });
    expect(original.items).toEqual([{ value: 2 }, { value: 3 }, { value: 4 }]);
    await callerBroker.useAgent<TestCallee>(agentKey, (target, { Math }) => {
      target.items.forEach((item) => {
        item.value = Math.multiply(2, item.value);
      });
    });
    expect(original.items).toEqual([{ value: 4 }, { value: 6 }, { value: 8 }]);
  });

  test('test var', async () => {
    const agentKey = 'test-var';
    interface Item {
      value: number;
    }
    const item: Item = { value: 1 };
    class TestCallee {
      fetch(cb: (data: Item) => void) {
        cb(item);
      }
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original);
    const res = await callerBroker.useAgent<TestCallee, Item>(
      agentKey,
      (target, { declareVar, assignVar }) => {
        const item = declareVar<Item>();
        target.fetch((data) => {
          assignVar(item, data);
        });
        return item;
      },
    );
    expect(res).toEqual(item);
  });

  test('test compare', async () => {
    const agentKey = 'test-compare';
    class TestCallee {
      w = '1';
      x = 1;
      y = 2;
      z = 2;
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original);
    expect(
      await callerBroker.useAgent<TestCallee, [boolean, boolean]>(
        agentKey,
        (target, { eq }) => {
          return [eq(target.w, target.x), eq(target.w, target.x, true)];
        },
      ),
    ).toEqual([true, false]);
    expect(
      await callerBroker.useAgent<TestCallee, [boolean, boolean]>(
        agentKey,
        (target, { gt }) => {
          return [gt(target.x, target.y), gt(target.y, target.x)];
        },
      ),
    ).toEqual([false, true]);
    expect(
      await callerBroker.useAgent<TestCallee, [boolean, boolean, boolean]>(
        agentKey,
        (target, { gte }) => {
          return [
            gte(target.x, target.y),
            gte(target.y, target.z),
            gte(target.z, target.x),
          ];
        },
      ),
    ).toEqual([false, true, true]);
    expect(
      await callerBroker.useAgent<TestCallee, [boolean, boolean]>(
        agentKey,
        (target, { lt }) => {
          return [lt(target.x, target.y), lt(target.y, target.x)];
        },
      ),
    ).toEqual([true, false]);
    expect(
      await callerBroker.useAgent<TestCallee, [boolean, boolean, boolean]>(
        agentKey,
        (target, { lte }) => {
          return [
            lte(target.x, target.y),
            lte(target.y, target.z),
            lte(target.z, target.x),
          ];
        },
      ),
    ).toEqual([true, true, false]);
  });

  test('test value check', async () => {
    const agentKey = 'test-compare';
    class TestCallee {
      a = null;
      b: number;
      c = '1';
      d = 100;
      e = true;
      f = {};
      g = () => {};
      h = 'x1';
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original);
    expect(
      await callerBroker.useAgent(agentKey, (agent: TestCallee, { isNull }) => {
        return [isNull(agent.a), isNull(agent.b), isNull(agent.c)];
      }),
    ).toEqual([true, true, false]);
    expect(
      await callerBroker.useAgent(
        agentKey,
        (agent: TestCallee, { isUndefined }) => {
          return [
            isUndefined(agent.a),
            isUndefined(agent.b),
            isUndefined(agent.c),
          ];
        },
      ),
    ).toEqual([false, true, false]);
    expect(
      await callerBroker.useAgent(
        agentKey,
        (agent: TestCallee, { isString }) => {
          return [isString(agent.c), isString(agent.d)];
        },
      ),
    ).toEqual([true, false]);
    expect(
      await callerBroker.useAgent(
        agentKey,
        (agent: TestCallee, { isNumber }) => {
          return [isNumber(agent.c), isNumber(agent.d)];
        },
      ),
    ).toEqual([false, true]);
    expect(
      await callerBroker.useAgent(
        agentKey,
        (agent: TestCallee, { isBoolean }) => {
          return [isBoolean(agent.e), isBoolean(agent.d)];
        },
      ),
    ).toEqual([true, false]);
    expect(
      await callerBroker.useAgent(
        agentKey,
        (agent: TestCallee, { isObject }) => {
          return [isObject(agent.f), isObject(agent.e)];
        },
      ),
    ).toEqual([true, false]);
    expect(
      await callerBroker.useAgent(
        agentKey,
        (agent: TestCallee, { isFunction }) => {
          return [isFunction(agent.g), isFunction(agent.f)];
        },
      ),
    ).toEqual([true, false]);
    expect(
      await callerBroker.useAgent(agentKey, (agent: TestCallee, { isNaN }) => {
        return [isNaN(agent.c), isNaN(agent.h)];
      }),
    ).toEqual([false, true]);
    expect(
      await callerBroker.useAgent(agentKey, (agent: TestCallee, { not }) => {
        return [not(agent.a), not(agent.e)];
      }),
    ).toEqual([true, false]);
    expect(
      await callerBroker.useAgent(agentKey, (agent: TestCallee, { notNot }) => {
        return [notNot(agent.a), notNot(agent.e)];
      }),
    ).toEqual([false, true]);
    expect(
      await callerBroker.useAgent(
        agentKey,
        (agent: TestCallee, { $typeof }) => {
          return [$typeof(agent.d), $typeof(agent.e)];
        },
      ),
    ).toEqual(['number', 'boolean']);
  });

  test('test if', async () => {
    const agentKey = 'test-compare';
    class TestCallee {
      success: boolean;
      counter = 1;
      increase() {
        this.counter++;
      }
      decrease() {
        this.counter--;
      }
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original);
    await callerBroker.useAgent<TestCallee>(agentKey, (agent, { $if }) => {
      agent.success = true;
      $if(agent.success, () => {
        agent.increase();
      });
    });
    expect(original.counter).toEqual(2);
    await callerBroker.useAgent<TestCallee>(agentKey, (agent, { $if }) => {
      agent.success = false;
      $if(
        agent.success,
        () => {
          agent.increase();
        },
        () => {
          agent.decrease();
        },
      );
    });
    expect(original.counter).toEqual(1);
  });
});
