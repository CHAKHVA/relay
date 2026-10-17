import type { boardState } from '@/lib/engine/state';

/** JSON-serialized shape of a server value (Dates become ISO strings). */
export type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

export type BoardState = Serialized<Awaited<ReturnType<typeof boardState>>>;
export type BoardMember = BoardState['members'][number];
export type BoardTask = BoardState['tasks'][number];
export type BoardEvent = BoardState['events'][number];
