export interface BrokerMessage {
  /**
   * Message unique type
   */
  readonly type: string;
  /**
   * Message payload
   */
  readonly payload?: any;
}
export interface BrokerRequest extends BrokerMessage {
  /**
   * Message session ID
   */
  readonly id: string;
}
export interface BrokerResponse {
  /**
   * Message session ID
   */
  readonly id: string;
  /**
   * Error
   */
  readonly error?: any;
  /**
   * Response payload
   */
  readonly payload?: any;
}

export function isResponse(msg: unknown): msg is BrokerResponse {
  return (msg as BrokerResponse).id !== undefined;
}
export function isEvent(msg: unknown): msg is BrokerMessage {
  return (msg as BrokerMessage).type !== undefined;
}
export function isRequest(msg: unknown): msg is BrokerRequest {
  return (msg as BrokerRequest).id !== undefined;
}
