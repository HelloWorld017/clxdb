import { useEffect, useState } from 'react';

export const LocationOrigin = () => {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(location.origin), []);

  return origin && <code>{origin}</code>;
};
