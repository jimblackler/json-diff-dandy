import Heap from 'heap';

export type Comparator = (a: number, b: number) => boolean;
type Cell = { a: number, b: number };

export function* fastCommonSequence(comparator: Comparator, aLength: number, bLength: number) {
  function area(cell: Cell) {
    return (aLength - cell.a - 1) * (bLength - cell.b - 1);
  }

  let a = 0;
  let b = 0;

  const heap = new Heap((u: Cell, v: Cell) => area(v) - area(u));

  while (a < aLength && b < bLength) {
    heap.clear();
    heap.push({a, b});

    while (true) {
      const largest = heap.pop();
      if (!largest) {
        return;
      }
      if (comparator(largest.a, largest.b)) {
        yield [largest.a, largest.b];
        a = largest.a + 1;
        b = largest.b + 1;
        break;
      }
      if (largest.a === a && largest.b < bLength - 1) {
        heap.push({a: largest.a, b: largest.b + 1});
      }
      if (largest.a < aLength - 1) {
        heap.push({a: largest.a + 1, b: largest.b});
      }
    }
  }
}
