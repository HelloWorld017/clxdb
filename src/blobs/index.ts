import { ClxBlobs, type ClxBlobsParams } from './clxblobs';

export const createClxBlobs = (params: ClxBlobsParams): ClxBlobs => new ClxBlobs(params);

export { ClxBlobs };
export type { ClxBlobsParams };
