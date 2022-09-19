import { Dispatch, IAdapter, JSONObject } from "../adapter";

export class WindowAdapter implements IAdapter {
  private readonly _target: Window;
  private readonly _self: Window;
  private readonly _namespace: string;
  private _attached: (e: MessageEvent) => void;

  /**
   * Create WindowAdapter instance
   * @param ns Namespace
   * @param target Message target window object
   */
  constructor(ns: string, target: Window);
  /**
   * Create WindowAdapter instance
   * @param ns Namespace
   * @param target Message target window object
   * @param self Self window object
   */
  constructor(ns: string, target: Window, self: Window);
  /**
   * Create WindowAdapter instance
   * @param ns Namespace
   * @param target Message target window object
   * @param self Self window object
   */
  constructor(ns: string, target: Window, self: Window);
  constructor(ns: string, target: Window, self?: Window) {
    this._target = target;
    this._self = self || window;
    this._namespace = ns;
  }

  attach(dispatch: Dispatch): void {
    if (this._attached != null) {
      return;
    }
    this._attached = (e) => {
      if (e.data?.__ns === this._namespace) {
        dispatch(e.data.payload);
      }
    };
    this._self.addEventListener("message", this._attached);
  }

  detach(): void {
    if (this._attached == null) {
      return;
    }
    this._self.removeEventListener("message", this._attached);
  }

  send(data: JSONObject): void {
    this._target.postMessage({ __ns: this._namespace, payload: data }, "*");
  }
}
