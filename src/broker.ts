import { IAdapter } from "./adapter";

export abstract class Broker {
  /**
   * Message adapter
   */
  protected readonly adapter: IAdapter;

  constructor(adapter: IAdapter) {
    this.adapter = adapter;
    this.adapter.attach(this.onAdapterMessage);
  }

  /**
   * On receive message from adapter
   * @param msg Adapter message
   */
  protected abstract onAdapterMessage(msg: unknown): void;

  /**
   * Dispose resources
   */
  dispose() {
    this.adapter.detach();
  }
}
