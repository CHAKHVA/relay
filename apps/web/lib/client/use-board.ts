'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { BoardState } from './types';

export const boardKey = (id: string) => ['board', id] as const;

/** Board state, polled every 5 seconds (SPEC §13). */
export function useBoard(id: string) {
  return useQuery({
    queryKey: boardKey(id),
    queryFn: () => api<BoardState>(`/api/w/${id}/state`),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

export function useRefreshBoard(id: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: boardKey(id) });
}
