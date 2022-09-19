import {
  CalleeBroker,
  CallerAgent,
  CallerBroker,
  WindowAdapter,
} from "../../src";

describe("test agents", () => {
  let calleeBroker: CalleeBroker;
  let callerBroker: CallerBroker;

  beforeAll(() => {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    const ns = "test";
    calleeBroker = new CalleeBroker({
      adapter: new WindowAdapter(ns, frame.contentWindow!, window),
    });
    callerBroker = new CallerBroker({
      adapter: new WindowAdapter(
        ns,
        frame.contentWindow!.parent,
        frame.contentWindow!
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

  test("test get", async () => {
    const agentKey = "test-get";
    const value = 1;
    class TestCallee {
      id = value;
    }
    calleeBroker.injectAgent(agentKey, new TestCallee());
    const agent = callerBroker.useAgent<TestCallee>(agentKey);
    const prop = agent.id;
    expect(prop).toBeInstanceOf(CallerAgent);
    expect(await prop).toEqual(value);
  });

  test("test set", async () => {
    const agentKey = "test-set";
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

  test("test call", async () => {
    const agentKey = "test-call";
    const value = 1;
    class TestCallee {
      run() {
        return value;
      }
    }
    calleeBroker.injectAgent(agentKey, new TestCallee());
    const agent = callerBroker.useAgent<TestCallee>(agentKey);
    const res = agent.run();
    expect(res).toBeInstanceOf(Promise);
    expect(await res).toEqual(value);
  });
});
