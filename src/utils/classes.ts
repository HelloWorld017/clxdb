import { twMerge } from 'tailwind-merge';

export const classes = (...values: Array<string | null | undefined | false>) =>
  twMerge(values.filter(Boolean));
