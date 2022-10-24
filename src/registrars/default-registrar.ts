import { IRegistrar } from './registrar';

export class DefaultRegistrar implements IRegistrar {
  private _seed = 0;

  next(): string {
    return String(++this._seed);
  }

  reset(): void {
    this._seed = 0;
  }
}
