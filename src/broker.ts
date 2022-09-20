import { IAdapter } from './adapter';

export abstract class Broker {
  constructor(protected readonly adapter: IAdapter) {
    this.adapter = adapter;
    this.adapter.attach(this.onAdapterMessage.bind(this));
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
