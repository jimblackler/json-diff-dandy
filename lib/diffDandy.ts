import {applyPatch} from 'fast-json-patch';
import JsonPointer from 'json-pointer';
import isEqual from 'lodash.isequal';
import {JSONPatchOperation, JSONValue} from './jsonTypes';

function visitAll<T>(
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

export function locateMatch(tree: JSONValue, value: JSONValue) {
  return visitAll(tree,
      (path, value1) => isEqual(value, value1) ? {result: path, recurse: false} : {recurse: true});
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

  visitAll(target, (path, value) => {
    const pointer = JsonPointer.compile(path);
    if (JsonPointer.has(working, pointer) && isEqual(
        typeof working === 'object' && working !== null ? JsonPointer.get(working, path) : working,
        typeof target === 'object' && target !== null ? JsonPointer.get(target, path) : target)) {
      // Trees have matching contents and paths; nothing to do.
      return {recurse: false};
    } else {
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' ||
          value === null) {
        if (JsonPointer.has(working, pointer)) {
          registerOperation({op: 'replace', path: pointer, value});
        } else {
          registerOperation({op: 'add', path: pointer, value});
        }
        return {recurse: false};
      }

      // Can we copy/move something from the working document?
      const located = locateMatch(working, value);
      if (located) {
        const fromPointer = JsonPointer.compile(located);
        if (JsonPointer.has(target, fromPointer)) {
          registerOperation({op: 'copy', from: fromPointer, path: pointer});
        } else {
          registerOperation({op: 'move', from: fromPointer, path: pointer});
        }
        return {recurse: false};
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
