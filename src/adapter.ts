export interface IAdapter {
  /**
   * Called when this adapter being attached
   * @param dispatch Dispatch function
   */
  attach(dispatch: Dispatch): void;
  /**
   * Called when this adapter being detached
   */
  detach(): void;
  /**
   * Send data
   * @param data Raw data
   */
  send(data: JSONObject): void;
}

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [member: string]: JSONValue };
export interface JSONArray extends Array<JSONValue> {}

export type Dispatch = (msg: JSONObject) => void;

export type IObject = { [x: string | number]: any };
