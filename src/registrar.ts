export interface IRegistrar {
  /**
   * get the next correlation ID
   */
  next(): string;

  /**
   * Reset context
   */
  reset(): void;
}
