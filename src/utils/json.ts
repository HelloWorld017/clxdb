function hasObjectPrototype(o: unknown): o is object {
  return Object.prototype.toString.call(o) === '[object Object]';
}

// Copied from jonschlinkert/is-plain-object
function isPlainObject(o: unknown): o is Record<PropertyKey, unknown> {
  if (!hasObjectPrototype(o)) {
    return false;
  }

  // If has no constructor
  const ctor = o.constructor;
  if (ctor === undefined) {
    return true;
  }

  // If has modified prototype
  const prot = ctor.prototype as unknown;
  if (!hasObjectPrototype(prot)) {
    return false;
  }

  // If constructor does not have an Object-specific method
  if (!Object.hasOwn(prot, 'isPrototypeOf')) {
    return false;
  }

  // Handles Objects created by Object.create(<arbitrary prototype>)
  if (Object.getPrototypeOf(o) !== Object.prototype) {
    return false;
  }

  // Most likely a plain Object
  return true;
}

// Copied from TanStack/query: packages/query-core/src/utils.ts
export function stableJSONSerialize(object: unknown): string {
  return JSON.stringify(object, (_, val) =>
    isPlainObject(val)
      ? Object.keys(val)
          .sort()
          .reduce<Record<string, unknown>>((result, key) => {
            result[key] = val[key];
            return result;
          }, {})
      : (val as unknown)
  );
}
