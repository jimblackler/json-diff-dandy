export type JSONValue = JSONObject | JSONArray | string | number | boolean | null;

export type JSONObject = {
  [key: string]: JSONValue;
};

export function isJSONObject(value: JSONValue): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type JSONArray = JSONValue[];

export type JSONPatchAdd = {
  op: 'add';
  path: string;
  value: JSONValue;
}

export type JSONPatchRemove = {
  op: 'remove';
  path: string;
}

export type JSONPatchReplace = {
  op: 'replace';
  path: string;
  value: JSONValue;
}

export type JSONPatchCopy = {
  op: 'copy';
  path: string;
  from: string;
}

export type JSONPatchMove = {
  op: 'move';
  path: string;
  from: string;
}

export type JSONPatchTest = {
  op: 'test';
  path: string;
  value: JSONValue;
}

export type JSONPatchOperation = JSONPatchAdd | JSONPatchRemove | JSONPatchReplace | JSONPatchCopy |
    JSONPatchMove | JSONPatchTest;
