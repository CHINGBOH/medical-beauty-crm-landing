import { logger } from './logger';

type Metrics = {
  increment: (name: string, labels?: Record<string, string | number>) => void;
  gauge: (name: string, value: number, labels?: Record<string, string | number>) => void;
  histogram: (name: string, value: number, labels?: Record<string, string | number>) => void;
  timing: (name: string, value: number, labels?: Record<string, string | number>) => void;
};

export const metrics: Metrics = {
  increment: () => {},
  gauge: () => {},
  histogram: () => {},
  timing: () => {},
};

export { logger };
