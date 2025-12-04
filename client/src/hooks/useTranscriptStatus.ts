import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface TranscriptInfo {
  id: string;
  videoId: string;
  provider: string;
  status: string;
  errorMessage: string | null;
}

export interface TranscriptStatus {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  error: number;
  transcripts: TranscriptInfo[];
}

export function useTranscriptStatus(documentId: string | undefined) {
  return useQuery<TranscriptStatus>({
    queryKey: ['/api/documents', documentId, 'transcripts'],
    enabled: !!documentId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.pending > 0 || data.processing > 0)) {
        return 3000;
      }
      return false;
    },
  });
}

export function useRetryTranscript() {
  return useMutation({
    mutationFn: async (transcriptId: string) => {
      const response = await apiRequest("POST", `/api/transcripts/${transcriptId}/retry`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
  });
}

export function useSyncTranscripts() {
  return useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiRequest("POST", `/api/documents/${documentId}/sync-transcripts`);
      return response.json();
    },
    onSuccess: (_data, documentId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', documentId, 'transcripts'] });
    },
  });
}
