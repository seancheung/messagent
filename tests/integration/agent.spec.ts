import {
  BatchedCallerAgent,
  CalleeBroker,
  CallerBroker,
  DeferredCallerAgent,
  WindowAdapter,
} from '../../src';

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
    const agent = callerBroker.useAgent<TestCallee>(agentKey);
    const prop = agent.id;
    expect(prop).toBeInstanceOf(DeferredCallerAgent);
    expect(await prop).toEqual(value);
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
    const agent = callerBroker.useAgent<TestCallee>(agentKey);
    (agent as any as TestCallee).id = value;
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(original.id).toEqual(value);
  });

  test('test call', async () => {
    const agentKey = 'test-call';
    const value = 1;
    class TestCallee {
      run() {
        return value;
      }
    }
    calleeBroker.injectAgent(agentKey, new TestCallee());
    const agent = callerBroker.useAgent<TestCallee>(agentKey);
    const res = agent.run();
    expect(res).toBeInstanceOf(DeferredCallerAgent);
    expect(await res).toEqual(value);
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
    calleeBroker.injectAgent(agentKey, new TestCallee(), true);
    const agent = callerBroker.useAgent<TestCallee>(agentKey);
    expect(await agent.item.id).toEqual(1);
    expect(await agent.item).toEqual({ id: 1 });
    expect(await agent.items).toBeInstanceOf(Array);
    await agent.spawn(3);
    expect(await agent.items.length).toEqual(2);
    await agent.items.splice(0, await agent.items.length);
    expect(await agent.items.length).toEqual(0);
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
    calleeBroker.injectAgent(agentKey, original, true);
    const count = await callerBroker.useAgent<TestCallee, number>(
      agentKey,
      (agent) => {
        expect(agent).toBeInstanceOf(BatchedCallerAgent);
        const item1 = agent.spawn(1);
        const item2 = agent.spawn(2);
        agent.items.push(item1, item2);
        item2.id = 3;
        const item3 = new agent.Item(4);
        agent.items.push(item3);
        return agent.items.length;
      },
    );
    expect(count).toEqual(3);
    expect(count).toEqual(original.items.length);
    expect(original.items[1].id).toEqual(3);
    expect(original.items[2].id).toEqual(4);
  });

  test('test batch async', async () => {
    const agentKey = 'test-batch-async';
    class TestCallee {
      async calc(num: number) {
        return 2 * num;
      }
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original, true);
    const res = await callerBroker.useAgent<TestCallee, Promise<number>>(
      agentKey,
      async (agent) => {
        const data = agent.calc(2);
        const num = await data;
        return agent.calc(num);
      },
    );
    expect(res).toEqual(8);
  });

  test('test batch match', async () => {
    const agentKey = 'test-batch-math';
    class TestCallee {
      x = 1;
      y = 2;
      z = 0;
    }
    const original = new TestCallee();
    calleeBroker.injectAgent(agentKey, original, true);
    const res = await callerBroker.useAgent<TestCallee, number>(
      agentKey,
      (agent, { sum, subtract, divide, multiply }) => {
        agent.x = sum(agent.x, 1);
        agent.y = subtract(agent.y, 1);
        agent.z = divide(agent.x, agent.y);
        return multiply(2, agent.z);
      },
    );
    expect(original.x).toEqual(2);
    expect(original.y).toEqual(1);
    expect(original.z).toEqual(2);
    expect(res).toEqual(4);
  });
});
