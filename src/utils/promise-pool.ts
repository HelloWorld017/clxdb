const wrapPromise = <T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> =>
  promise.then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ status: 'rejected', reason: reason as unknown })
  );

export const createPromisePool = async <T>(
  generator: Generator<Promise<T>, void>,
  concurrency = 5
) => {
  const output: PromiseSettledResult<T>[] = [];
  const worker = async () => {
    for (const promise of generator) {
      output.push(await wrapPromise(promise));
    }
  };

  await Promise.all(Array.from({ length: concurrency }).map(worker));
  return output;
};
