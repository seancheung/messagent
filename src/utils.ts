export const nextTick: (cb: (...args: unknown[]) => void) => void =
  typeof setImmediate !== "undefined"
    ? setImmediate
    : (cb) => Promise.resolve(() => cb.call(undefined));

export function formatError(error: string | Error) {
  if (typeof error === "string") {
    return error;
  }
  if (error != null && typeof error === "object") {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return error;
}
