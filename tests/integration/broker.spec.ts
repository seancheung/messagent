import { CalleeBroker, CallerBroker, WindowAdapter } from "../../src";

describe("test brokers", () => {
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

  test("test send", (done) => {
    const type = "test-send";
    const payload = { prop: "value" };
    calleeBroker.setHandler(type, (_, msg) => {
      expect(msg).toEqual(payload);
      done();
    });
    callerBroker.send({ type, payload });
  });

  test("test request", (done) => {
    const type = "test-req";
    const payload = { prop: "value" };
    const data = { success: true };
    calleeBroker.setHandler(type, (_, msg) => {
      expect(msg).toEqual(payload);
      return data;
    });
    callerBroker.request({ type, payload }).then((res) => {
      expect(res).toEqual(data);
      done();
    });
  });

  test("test request error", (done) => {
    const type = "test-req-err";
    const msg = "failed";
    calleeBroker.setHandler(type, () => {
      throw new Error(msg);
    });
    callerBroker.request({ type }).catch((err) => {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toEqual(msg);
      done();
    });
  });

  test("test request raw", (done) => {
    const type = "test-req-raw";
    const data = { success: true };
    calleeBroker.setRawHandler(type, (ctx) => {
      ctx.req!.end(undefined, data);
    });
    callerBroker.request({ type }).then((res) => {
      expect(res).toEqual(data);
      done();
    });
  });

  test("test subscribe", (done) => {
    const type = "test-sub";
    const payload = { prop: "value" };
    callerBroker.subscribe(type, (data) => {
      expect(data).toEqual(payload);
      done();
    });
    calleeBroker.publish({ type, payload });
  });
});
