import { FormEvent, useState } from 'react';
import { assessClaim, AssessmentResult } from '../api/claims';

// Minimal, dependency-free (no UI kit) component demonstrating the end-to-end call:
// Evaluator pastes the claim + clinical study text -> POST /api/claims/assess -> render verdict.
export default function ClaimAssessment() {
  const [claimText, setClaimText] = useState('Reduces the appearance of wrinkles by 20% in 4 weeks.');
  const [evidenceText, setEvidenceText] = useState(
    'Double-blind, placebo-controlled study, n=42 participants, 4-week duration. ' +
      'Measured a 21% average reduction in wrinkle depth (p<0.05) vs. placebo using standardized skin imaging.',
  );
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await assessClaim({ claimText, evidenceText });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h2>Claim Assessment</h2>

      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Claim
          <textarea
            value={claimText}
            onChange={(e) => setClaimText(e.target.value)}
            rows={2}
            style={{ width: '100%', marginTop: 4 }}
            required
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          Clinical study evidence
          <textarea
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            rows={5}
            style={{ width: '100%', marginTop: 4 }}
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Assessing…' : 'Assess claim'}
        </button>
      </form>

      {error && (
        <p role="alert" style={{ color: '#b91c1c', marginTop: 16 }}>
          {error}
        </p>
      )}

      {result && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 8,
            border: `1px solid ${result.justified ? '#16a34a' : '#dc2626'}`,
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>
            Justified:{' '}
            <span style={{ color: result.justified ? '#16a34a' : '#dc2626' }}>
              {result.justified ? 'Yes' : 'No'}
            </span>
          </p>

          <p style={{ margin: '8px 0' }}>
            Confidence score: {(result.confidenceScore * 100).toFixed(0)}%
          </p>
          <div style={{ background: '#e5e7eb', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div
              style={{
                width: `${result.confidenceScore * 100}%`,
                height: '100%',
                background: result.justified ? '#16a34a' : '#dc2626',
              }}
            />
          </div>

          <p style={{ marginTop: 12, marginBottom: 0 }}>
            <strong>Reasoning:</strong> {result.reasoning}
          </p>

          <p style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
            Model: {result.modelUsed} · Assessment ID: {result.id}
          </p>
        </div>
      )}
    </div>
  );
}
