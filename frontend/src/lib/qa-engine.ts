import type { CitationClause, DamageStats } from './types';

export interface QAResponse {
  summary: string;
  directAnswer: string;
  descriptiveAnalysis: string;
  fullContent: string;
  citations: CitationClause[];
  proactiveNotes: string[];
  severityScore: number;
}

export function answerFloodQuery(
  question: string,
  stats?: DamageStats,
  _locationName?: string,
): QAResponse {
  const summary = stats
    ? `The segmentation output marks ${stats.total_inundated_pixels.toLocaleString()} flood-class pixels (${stats.flood_coverage_pct.toFixed(2)}% of the analyzed image).`
    : 'No image-derived segmentation metrics are available for this question.';
  const directAnswer =
    'This local response cannot establish floodwater depth, a safe route, incident severity, or a real-world location. Use verified local authorities and field observations for emergency decisions.';
  const descriptiveAnalysis = stats
    ? `#### Image-derived output\n${summary}\n\nThese are model-predicted pixels and component estimates only. They are not georeferenced area, calibrated depth, or verified object counts.`
    : `#### Evidence status\n${summary}\n\nNo incident-specific facts or verified source documents were provided, so this response does not infer conditions or recommend an operational action.`;
  const fullContent = `### Evidence-limited response\n\n${directAnswer}\n\n${descriptiveAnalysis}\n\nQuestion: ${question}`;

  return {
    summary,
    directAnswer,
    descriptiveAnalysis,
    fullContent,
    citations: [],
    proactiveNotes: [],
    severityScore: stats?.severity_score ?? 0,
  };
}
