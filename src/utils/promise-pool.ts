const wrapPromise = <T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> =>
  promise.then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ status: 'rejected', reason: reason as unknown })
  );

interface PromisePoolOptions {
  concurrency?: number;
}

export const createPromisePoolSettled = async <T>(
  generator: Iterable<Promise<T>, void>,
  { concurrency = 5 }: PromisePoolOptions = {}
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

export const createPromisePool = async <T>(
  generator: Iterable<Promise<T>, void>,
  opts?: PromisePoolOptions
) => {
  const output = await createPromisePoolSettled(generator, opts);
  const error = output.find(result => result.status === 'rejected');
  if (error) {
    throw error.reason;
  }

  return output.map(result => (result as PromiseFulfilledResult<T>).value);
};
