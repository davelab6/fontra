// Copied mostly from
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set

export function isEqualSet<T>(set1: Set<T>, set2: Set<T>): boolean {
  if (set1.size !== set2.size) {
    return false;
  }
  for (let elem of set1) {
    if (!set2.has(elem)) {
      return false;
    }
  }
  return true;
}

export function isSuperset<T>(set: Set<T>, subset: Set<T>): boolean {
  for (let elem of subset) {
    if (!set.has(elem)) {
      return false;
    }
  }
  return true;
}

export function union<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  let _union = new Set(setA);
  for (let elem of setB) {
    _union.add(elem);
  }
  return _union;
}

export function intersection<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  let _intersection: Set<T> = new Set();
  for (let elem of setB) {
    if (setA.has(elem)) {
      _intersection.add(elem);
    }
  }
  return _intersection;
}

export function symmetricDifference<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  let _difference = new Set(setA);
  for (let elem of setB) {
    if (_difference.has(elem)) {
      _difference.delete(elem);
    } else {
      _difference.add(elem);
    }
  }
  return _difference;
}

export function difference<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  let _difference = new Set(setA);
  for (let elem of setB) {
    _difference.delete(elem);
  }
  return _difference;
}

export function lenientIsEqualSet<T>(set1: Set<T>, set2: Set<T>): boolean {
  if (set1 === set2) {
    // same object, or both undefined
    return true;
  }
  if (set1 && set2 && isEqualSet(set1, set2)) {
    return true;
  }
  return false;
}

export function updateSet<T>(set: Set<T>, iterable: T[]) {
  for (const item of iterable) {
    set.add(item);
  }
}

export function filterSet<T>(
  set: Set<T>,
  func: (value: T, index: number, array: T[]) => value is T
): Set<T> {
  return new Set([...set].filter(func));
}

export function setPopFirst<T>(set: Set<T>): T | undefined {
  if (!set.size) {
    return;
  }
  let firstItem;
  for (firstItem of set) {
    break;
  }
  set.delete(firstItem);
  return firstItem;
}
