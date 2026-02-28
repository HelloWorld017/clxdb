const wrapPromise = <T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> =>
  promise.then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ status: 'rejected', reason: reason as unknown })
  );

interface PromisePoolOptions {
  concurrency?: number;
  total?: number;
  onProgress?: (progress: number, total: number) => void;
}

export const createPromisePoolSettled = async <T>(
  generator: Iterable<Promise<T>, void>,
  { concurrency = 5, total = 0, onProgress }: PromisePoolOptions = {}
) => {
  const output: PromiseSettledResult<T>[] = [];
  let progress = 0;

  const worker = async () => {
    for (const promise of generator) {
      output.push(await wrapPromise(promise));
      progress += 1;
      onProgress?.(progress, total);
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
