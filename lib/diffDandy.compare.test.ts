import Alea from 'alea';
import {expect} from 'chai';
import {applyPatch, compare} from 'fast-json-patch';
import {default as diff0} from 'json-patch-gen';
import {diff as diff1} from 'json8-patch';
import {createPatch} from 'rfc6902';
import {assertNotNull} from './check/null';
import {diff, visitAll} from './diffDandy';
import {JSONPatchOperation, JSONValue} from './jsonTypes';

const jiff = require('jiff');

type Technique = {
  name: string;
  getDiff: (a: JSONValue, b: JSONValue) => JSONPatchOperation[];
}

type Test = {
  doc1: JSONValue;
  doc2: JSONValue;
};

function score(patch: JSONPatchOperation[]) {
  let score = 0;
  patch.forEach(operation => {
    if (!('value' in operation)) {
      return;
    }

    visitAll(operation.value, () => {
      score++;
      return {recurse: true}
    });
  });
  return score;
}

function standardTest(test: Test) {
  describe(`${JSON.stringify(test.doc1)} -> ${JSON.stringify(test.doc2)}`, () => {
    const techniques: Technique[] = [
      {name: 'diffDandy', getDiff: (a, b) => diff(a, b)},
      {name: 'rfc6902', getDiff: (a, b) => createPatch(a, b)},
      {name: 'JSON8', getDiff: (a, b) => diff1(a, b)},
      {name: 'fast-json-patch', getDiff: (a, b) => compare(assertNotNull(a), assertNotNull(b))},
      {name: 'jiff', getDiff: (a, b) => jiff.diff(a, b, undefined)},
      {
        name: 'json-patch-gen', getDiff: (a, b) => {
          if (typeof a === 'object' && typeof b === 'object') {
            return diff0(a, b);
          }
          return null;
        }
      }
    ];
    techniques.forEach(technique => {
      it(technique.name, () => {
        const patch = technique.getDiff(test.doc1, test.doc2);
        console.log(`${technique.name} ${score(patch)} ${patch.length}`);
        console.log(JSON.stringify(patch));
        const doc1copy = JSON.parse(JSON.stringify(test.doc1));
        const patchResult = applyPatch(doc1copy, patch);
        if (patchResult.length > 0 && patchResult[0].newDocument !== undefined) {
          expect(patchResult[0].newDocument).to.deep.eq(test.doc2);
        } else {
          expect(doc1copy).to.deep.eq(test.doc2);
        }
        console.log();
      });
    });
  });
}

describe('diffDandy.compare.test', () => {
  const tests: Test[] = [
    {
      doc1: {},
      doc2: {a: 0}
    },
    {
      doc1: {a: 0},
      doc2: {a: 1}
    },
    {
      doc1: {a: 0},
      doc2: {a: 0, b: {a: 0}}
    },
    {
      doc1: {a: 0},
      doc2: {a: 1, b: {a: 0}}
    },
    {
      doc1: {a: 0},
      doc2: {b: {a: 0}}
    },
    {
      doc1: {a: 0},
      doc2: {b: 0}
    },
    {
      doc1: {a: 0, b: 1},
      doc2: {c: {a: 0, b: 1}}
    },
    {
      doc1: {a: [1]},
      doc2: {a: []}
    },
    {
      doc1: {a: [1]},
      doc2: {a: [1, 2]}
    },
    {
      doc1: {a: [1]},
      doc2: {a: [1, 2, 3]}
    },
    {
      doc1: [{a: 0, b: 0}],
      doc2: [{a: 0, b: 1}]
    },
    {
      doc1: [],
      doc2: [0]
    },
    {
      doc1: [0],
      doc2: [0, 0]
    },
    {
      doc1: [0],
      doc2: [0, 1]
    },
    {
      doc1: [0],
      doc2: [1, 0]
    },
    {
      doc1: [0],
      doc2: [1, 0, 2]
    },
    {
      doc1: [1],
      doc2: [0, 1]
    },
    {
      doc1: [0, 1],
      doc2: [1, 2]
    },
    {
      doc1: [1, 2],
      doc2: [0, 1, 2]
    },
    {
      doc1: [1, 2],
      doc2: [0, 1]
    },
    {
      doc1: [1, 2, 3],
      doc2: [0, 1, 2]
    },
    {
      doc1: [0, 1, 2, 3, 3, 2, 3, 0, 0, 0],
      doc2: [3, 2, 1, 1, 3, 2, 2, 2, 0, 1]
    },
    {
      doc1: [2, 0, 2, 3, 3, 0, 0, 1, 0, 3],
      doc2: [0, 1, 2, 2, 3, 0, 2, 1, 1, 2]
    },
    {
      doc1: ['A', 'D', 'A', 'A', 'A', 'B', 'D', 'C', 'C', 'B'],
      doc2: ['D', 'B', 'D', 'A', 'A', 'D', 'D', 'A', 'A', 'D']
    }
  ];
  const tests2 = tests.map(test => [test, {doc1: test.doc2, doc2: test.doc1}]).flat();
  tests2.forEach(standardTest);
});


describe('diffDandy.arrays.test', () => {
  const random = Alea(1);
  const tests3 = new Set<string>();

  function randomList(max: number) {
    const output: number[] = [];
    while (true) {
      const next = random.uint32() % (max + 1);
      if (next === max) {
        return output;
      }
      output.push(next);
    }
  }

   while(tests3.size < 50) {
    const test: Test = {
      doc1: randomList(3),
      doc2: randomList(3)
    };
    tests3.add(JSON.stringify(test));
  }
  const tests3l = Array.from(tests3);
  tests3l.sort((a, b) => a.length - b.length);
  tests3l.map(json => JSON.parse(json)).forEach(standardTest);
});
