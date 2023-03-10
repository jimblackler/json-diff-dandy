import {fastCommonSequence} from 'fast-common-sequence';
import {applyPatch} from 'fast-json-patch';
import JsonPointer from 'json-pointer';
import isEqual from 'lodash.isequal';
import {assertArray} from './check/array';
import {isJSONObject, JSONPatchOperation, JSONValue} from './jsonTypes';

export function visitAll<T>(
    obj: JSONValue,
    visitor: (path: string[], value: JSONValue) => { recurse: boolean, result?: T }): T | undefined {
  const result = visitor([], obj);
  if ('result' in result) {
    return result.result;
  }
  if (!result.recurse || obj == null || typeof obj !== 'object') {
    return undefined;
  }
  if (Array.isArray(obj)) {
    for (let index = 0; index !== obj.length; index++) {
      const result0 = visitAll(obj[index],
          (path, value) => visitor([index.toString(), ...path], value));
      if (result0 !== undefined) {
        return result0;
      }
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) {
        // 'undefined' not valid JSON. Ignore.
        continue;
      }
      const result0 = visitAll(value, (path, value) => visitor([key, ...path], value));
      if (result0 !== undefined) {
        return result0;
      }
    }
  }
}

function isPrefix<T>(a: T[], b: T[]) {
  return a.every((value, index) => value === b[index]);
}

export function locateMatch(tree: JSONValue, value: JSONValue, excluding: string[]) {
  return visitAll(tree,
      (path, value1) => !isPrefix(path, excluding) && isEqual(value, value1) ?
          {result: path, recurse: false} : {recurse: true});
}

function get(value: JSONValue, path: string) {
  if (typeof value === 'object' && value !== null) {
    return JsonPointer.get(value, path) as JSONValue;
  }
  if (path.length) {
    throw new Error();
  }
  return value;
}

export function diff(original: JSONValue, target: JSONValue): JSONPatchOperation[] {
  let working: JSONValue = JSON.parse(JSON.stringify(original));
  const operations: JSONPatchOperation[] = [];

  function registerOperation(operation: JSONPatchOperation) {
    const patchResult = applyPatch(working, [operation], true, true);
    const newDocument = patchResult[0].newDocument;
    if (patchResult.length && newDocument !== working) {
      working = newDocument;
    }
    operations.push(operation);
  }

  visitAll(target, (path_, value) => {
    const path = JsonPointer.compile(path_);
    if (JsonPointer.has(working, path) && isEqual(get(working, path), get(target, path))) {
      // Trees have matching contents and paths; nothing to do.
      return {recurse: false};
    } else {
      // Can we copy/move something from the working document?
      const located = locateMatch(working, value, path_);
      if (located) {
        const from = JsonPointer.compile(located);
        if (JsonPointer.has(target, from) && typeof target == 'object' && target !== null &&
            isEqual(value, get(target, from))) {
          registerOperation({op: 'copy', from, path});
        } else {
          registerOperation({op: 'move', from, path});
        }
        return {recurse: false};
      }

      if (JsonPointer.has(working, path)) {
        const existing = get(working, path);
        if (Array.isArray(existing) && Array.isArray(value)) {
          const sequence = Array.from(fastCommonSequence(
              (a, b) => isEqual(assertArray(existing)[a], value[b]),
              existing.length, value.length));
          sequence.push([existing.length, value.length]);
          let existingIdx = 0;
          let pairNumber = 0;
          while (pairNumber < sequence.length) {
            while (existingIdx < sequence[pairNumber][1]) {
              // Insert any missing content.
              if (!isEqual(existing[existingIdx], value[existingIdx])) {
                // Is there a (non-common sequence) entry we can move forward?
                let pairNumber2 = pairNumber + 1;
                let huntIdx = existingIdx + 1;
                while (huntIdx < existing.length) {
                  if (pairNumber2 !== sequence.length && sequence[pairNumber2][0] === huntIdx) {
                    pairNumber2++;
                  } else if (isEqual(existing[huntIdx], value[existingIdx])) {
                    break;
                  }
                  huntIdx++;
                }
                if (huntIdx < existing.length) {
                  registerOperation({
                    op: 'move',
                    from: JsonPointer.compile([...path_, huntIdx.toString()]),
                    path: JsonPointer.compile([...path_, existingIdx.toString()])
                  });
                  sequence.forEach(pair => {
                    if (pair[0] > huntIdx) {
                      pair[0]--;
                    }
                  });
                  sequence.forEach(pair => {
                    if (pair[0] >= existingIdx) {
                      pair[0]++;
                    }
                  });
                } else {
                  const exists = existing.findIndex(v => isEqual(v, value[existingIdx]));
                  if (exists !== -1) {
                    registerOperation({
                      op: 'copy',
                      from: JsonPointer.compile([...path_, exists.toString()]),
                      path: JsonPointer.compile([...path_, existingIdx.toString()]),
                    });
                    sequence.forEach(pair => {
                      if (pair[0] >= existingIdx) {
                        pair[0]++;
                      }
                    });
                  } else if (existingIdx < sequence[pairNumber][0]) {
                    // Leave to the recursion.
                  } else {
                    registerOperation({
                      op: 'add',
                      path: JsonPointer.compile([...path_, existingIdx.toString()]),
                      value: value[existingIdx]
                    });
                    sequence.forEach(pair => {
                      if (pair[0] >= existingIdx) {
                        pair[0]++;
                      }
                    });
                  }
                }
                if (!Array.isArray(existing)) {
                  throw new Error();
                }
              }
              existingIdx++;
            }

            while (existingIdx < sequence[pairNumber][0]) {
              // Remove any extra content.
              // Should push back?
              const hunt = () => {
                if (!Array.isArray(value) || !Array.isArray(existing)) {
                  throw new Error();
                }
                for (let afterSequence = pairNumber; afterSequence !== sequence.length - 1;
                     afterSequence++) {
                  for (let huntIdx = sequence[afterSequence][1] + 1;
                       huntIdx !== sequence[afterSequence + 1][1]; huntIdx++) {
                    if (isEqual(existing[existingIdx], value[huntIdx])) {
                      return afterSequence;
                    }
                  }
                }
                return undefined;
              };

              const afterSequence = hunt();
              if (afterSequence === undefined) {
                registerOperation({
                  op: 'remove',
                  path: JsonPointer.compile([...path_, existingIdx.toString()])
                });
                sequence.forEach(pair => {
                  if (pair[0] > existingIdx) {
                    pair[0]--;
                  }
                });
              } else {
                const insertPoint0 = sequence[afterSequence][0];
                registerOperation({
                  op: 'move',
                  from: JsonPointer.compile([...path_, existingIdx.toString()]),
                  path: JsonPointer.compile([...path_, insertPoint0.toString()])
                });
                sequence.forEach(pair => {
                  if (pair[0] > existingIdx) {
                    pair[0]--;
                  }
                  if (pair[0] >= insertPoint0) {
                    pair[0]++;
                  }
                });
              }
              if (!Array.isArray(existing)) {
                throw new Error();
              }
            }

            pairNumber++;
          }
          return {recurse: true};
        } else if (isJSONObject(value) && isJSONObject(existing)) {
          // Leave to the recursion.
        } else {
          registerOperation({op: 'replace', path, value});
          return {recurse: false};
        }
      } else {
        registerOperation({op: 'add', path, value});
      }
      return {recurse: true};
    }
  });

  const toRemove: string[] = [];
  visitAll(working, path => {
    const pointer = JsonPointer.compile(path);
    if (!JsonPointer.has(target, path)) {
      toRemove.unshift(JsonPointer.compile(path));
      return {recurse: false};
    }
    return {recurse: true};
  });
  toRemove.forEach(path => registerOperation({op: 'remove', path}));

  return operations;
}
