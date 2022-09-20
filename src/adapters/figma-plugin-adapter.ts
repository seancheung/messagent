import { Dispatch, IAdapter, JSONObject } from '../adapter';

export namespace FigmaPluginAdapter {
  declare const figma: any;
  declare const window: Window;

  /**
   * Adapter for Figma plugin sandbox environment
   */
  export class SandboxAdapter implements IAdapter {
    public debugging?: boolean;
    private readonly _namespace: string;
    private _attached?: (pluginMessage: any, props: { origin: string }) => void;

    /**
     * Create SandboxAdapter instance
     * @param ns Namespace
     */
    constructor(ns: string) {
      this._namespace = ns;
    }

    attach(dispatch: Dispatch): void {
      if (this._attached != null) {
        return;
      }
      this._attached = (msg) => {
        if (msg.__ns === this._namespace) {
          this.debugging &&
            console.log(`${this._namespace}.sandbox.received`, msg.payload);
          dispatch(msg.payload);
        }
      };
      figma.ui.on('message', this._attached);
    }

    detach(): void {
      if (this._attached == null) {
        return;
      }
      figma.ui.off('message', this._attached);
      this._attached = undefined;
    }

    send(data: JSONObject): void {
      this.debugging &&
        console.log(`${this._namespace}.sandbox.received`, data);
      figma.ui.postMessage({ __ns: this._namespace, payload: data });
    }
  }

  /**
   * Adapter for Figma plugin browser UI environment
   */
  export class BrowserAdapter implements IAdapter {
    public debugging?: boolean;
    private readonly _namespace: string;
    private _attached?: (e: MessageEvent) => void;

    /**
     * Create BrowserAdapter instance
     * @param ns Namespace
     */
    constructor(ns: string) {
      this._namespace = ns;
    }

    attach(dispatch: Dispatch): void {
      if (this._attached != null) {
        return;
      }
      this._attached = (e) => {
        if (e.data.pluginMessage?.__ns === this._namespace) {
          this.debugging &&
            console.log(
              `${this._namespace}.browser.received`,
              e.data.pluginMessage.payload,
            );
          dispatch(e.data.payload);
        }
      };
      window.addEventListener('message', this._attached);
    }

    detach(): void {
      if (this._attached == null) {
        return;
      }
      window.removeEventListener('message', this._attached);
      this._attached = undefined;
    }

    send(data: JSONObject): void {
      this.debugging && console.log(`${this._namespace}.browser.send`, data);
      window.parent.postMessage(
        { pluginMessage: { __ns: this._namespace, payload: data } },
        '*',
      );
    }
  }
}
