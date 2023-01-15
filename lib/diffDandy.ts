import {applyPatch} from 'fast-json-patch';
import JsonPointer from 'json-pointer';
import isEqual from 'lodash.isequal';
import {fastCommonSequence} from './fastCommonSequence';
import {JSONPatchOperation, JSONValue} from './jsonTypes';

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
      const result0 = visitAll(obj[index], (path, value) => visitor([index.toString(), ...path], value));
      if (result0 !== undefined) {
        return result0;
      }
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
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

export function diff(original: JSONValue, target: JSONValue): JSONPatchOperation[] {
  let working: JSONValue = JSON.parse(JSON.stringify(original));
  const operations: JSONPatchOperation[] = [];

  function registerOperation(operation: JSONPatchOperation) {
    const patchResult = applyPatch(working, [operation]);
    if (patchResult.length && patchResult[0].newDocument) {
      working = patchResult[0].newDocument;
    }
    operations.push(operation);
  }

  visitAll(target, (path_, value) => {
    const path = JsonPointer.compile(path_);
    if (JsonPointer.has(working, path) && isEqual(
        typeof working === 'object' && working !== null ? JsonPointer.get(working, path) : working,
        typeof target === 'object' && target !== null ? JsonPointer.get(target, path) : target)) {
      // Trees have matching contents and paths; nothing to do.
      return {recurse: false};
    } else {
      // Can we copy/move something from the working document?
      const located = locateMatch(working, value, path_);
      if (located) {
        const from = JsonPointer.compile(located);
        if (JsonPointer.has(target, from) && typeof target == 'object' && target !== null &&
            isEqual(value, JsonPointer.get(target, from))) {
          registerOperation({op: 'copy', from, path});
        } else {
          registerOperation({op: 'move', from, path});
        }
        return {recurse: false};
      }

      if (JsonPointer.has(working, path)) {
        if (Array.isArray(value) && typeof working === 'object' && working !== null) {
          const existing = JsonPointer.get(working, path);
          if (Array.isArray(existing)) {
            const sequence = [...fastCommonSequence(
                (a, b) => isEqual(existing[a], value[b]), existing.length, value.length)];
            let sequencePosition = 0;
            let insertPoint = 0;
            for (let idx = 0; idx !== value.length; idx++) {
              if (sequencePosition === sequence.length || idx < sequence[sequencePosition][1]) {
                registerOperation({
                  op: 'add',
                  path: JsonPointer.compile([...path_, insertPoint.toString()]),
                  value: value[idx]
                });
                sequence.forEach(pair => {
                  if (pair[0] >= insertPoint) {
                    pair[0]++;
                  }
                });
                insertPoint++;
              } else {
                insertPoint = sequence[sequencePosition][0] + 1;
                sequencePosition++;
              }
            }
            let existingIdx = 0;
            let valueIdx = 0;
            while (existingIdx < existing.length) {
              if (isEqual(value[valueIdx], existing[existingIdx])) {
                valueIdx++;
                existingIdx++;
              } else {
                registerOperation({
                  op: 'remove',
                  path: JsonPointer.compile([...path_, existingIdx.toString()])
                });
              }
            }
            return {recurse: false};
          }
        } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' ||
            value === null) {
          registerOperation({op: 'replace', path, value});
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
