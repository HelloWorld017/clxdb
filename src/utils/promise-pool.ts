const wrapPromise = <T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> =>
  promise.then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ status: 'rejected', reason: reason as unknown })
  );

interface PromisePoolOptions {
  concurrency?: number;
  onError?: (error: unknown) => void;
}

export const createPromisePool = async <T>(
  generator: Iterable<Promise<T>, void>,
  { concurrency = 5, onError }: PromisePoolOptions = {}
) => {
  const output: PromiseSettledResult<T>[] = [];
  const worker = async () => {
    for (const promise of generator) {
      output.push(await wrapPromise(promise));
    }
  };

  await Promise.all(Array.from({ length: concurrency }).map(worker));
  const error = output.find(result => result.status === 'rejected');
  if (error) {
    if (onError) {
      onError(error.reason);
    } else {
      throw error.reason;
    }
  }

  return output.map(result => (result as PromiseFulfilledResult<T>).value);
};
