import {compare, GetOperation} from "fast-json-patch";
import diff from 'json-patch-gen';
import {diff as diff1} from 'json8-patch';
import {createPatch} from "rfc6902";
import {assertNotNull} from "./check/null";
import {JSONPatchOperation, JSONValue} from "./jsonTypes";

const jiff = require('jiff');

type Technique = {
  name: string;
  getDiff: (a: JSONValue, b: JSONValue) => (JSONPatchOperation | GetOperation<JSONValue>)[];
}

type Test = {
  doc1: JSONValue;
  doc2: JSONValue;
};

describe('diffDandy.compare.test', () => {
  const tests: Test[] = [
    {
      doc1: {a: 'b'},
      doc2: {}
    }
  ];
  tests.forEach(test =>
      describe(`${JSON.stringify(test.doc1)} -> ${JSON.stringify(test.doc2)}`, () => {
        const techniques: Technique[] = [
          {name: 'JSON8', getDiff: (a, b) => diff1(a, b)},
          {name: 'rfc6902', getDiff: (a, b) => createPatch(a, b)},
          {name: 'fast-json-patch', getDiff: (a, b) => compare(assertNotNull(a), assertNotNull(b))},
          {name: 'jiff', getDiff: (a, b) => jiff.diff(a, b, undefined)},
          {
            name: 'json-patch-gen', getDiff: (a, b) => {
              if (typeof a === 'object' && typeof b === 'object') {
                return diff(a, b);
              }
              return null;
            }
          }
        ];
        techniques.forEach(technique => {
          it(technique.name, () => {
            console.log(technique.name);
            const patch = technique.getDiff(test.doc1, test.doc2);
            console.log(patch);
            console.log();
          });
        });
      })
  );
});
