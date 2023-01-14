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

  visitAll(target, (path_, value) => {
    const path = JsonPointer.compile(path_);
    if (JsonPointer.has(working, path) && isEqual(
        typeof working === 'object' && working !== null ? JsonPointer.get(working, path) : working,
        typeof target === 'object' && target !== null ? JsonPointer.get(target, path) : target)) {
      // Trees have matching contents and paths; nothing to do.
      return {recurse: false};
    } else {
      // Do literals (optional, but it could cause excessive copying otherwise).
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' ||
          value === null) {
        if (JsonPointer.has(working, path)) {
          registerOperation({op: 'replace', path, value});
        } else {
          registerOperation({op: 'add', path, value});
        }
        return {recurse: false};
      }

      // Can we copy/move something from the working document?
      const located = locateMatch(working, value);
      if (located) {
        const from = JsonPointer.compile(located);
        if (JsonPointer.has(target, from)) {
          registerOperation({op: 'copy', from, path});
        } else {
          registerOperation({op: 'move', from, path});
        }
        return {recurse: false};
      }

      if (!JsonPointer.has(working, path)) {
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
