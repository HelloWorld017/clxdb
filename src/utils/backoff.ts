const BASE_RETRY_DELAY_MS = 100;
const RETRY_JITTER_FACTOR = 0.25;

export const delayWithBackoff = (attempt: number): Promise<void> => {
  const baseDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = baseDelay * RETRY_JITTER_FACTOR * (Math.random() * 2 - 1);
  const delay = baseDelay + jitter;
  return new Promise(resolve => setTimeout(resolve, Math.max(0, delay)));
};
