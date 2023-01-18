export function assertArray(object: unknown) {
  if (!Array.isArray(object)) {
    throw new Error();
  }
  return object;
}
