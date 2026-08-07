export interface AssessClaimRequest {
  claimId?: string;
  evidenceId?: string;
  claimText?: string;
  evidenceText?: string;
}

export interface AssessmentResult {
  id: string;
  justified: boolean;
  confidenceScore: number;
  reasoning: string;
  modelUsed: string;
  status: 'COMPLETED' | 'FAILED';
  createdAt: string;
}

const API_BASE = import.meta.env?.VITE_API_BASE ?? 'http://localhost:3001';

export async function assessClaim(payload: AssessClaimRequest): Promise<AssessmentResult> {
  const res = await fetch(`${API_BASE}/api/claims/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Assessment request failed (${res.status})`);
  }

  return res.json();
}
