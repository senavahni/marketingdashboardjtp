import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { LlmKeyRotateResult } from '../lib/llm-keys';

export const useRotateLlmKey = (ws: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentKey: string) =>
      api<LlmKeyRotateResult>(`/workspaces/${ws}/intel/llm-keys/${encodeURIComponent(agentKey)}/rotate`, { method: 'POST' }),
    // status (prefix, waktu rotasi) harus tampil ulang untuk semua rentang hari
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intel', 'llm-status', ws] }),
  });
};
