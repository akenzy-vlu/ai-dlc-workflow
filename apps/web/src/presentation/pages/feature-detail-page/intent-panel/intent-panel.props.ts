import type { FeatureDetail } from '@domain/entities';

export interface IntentPanelProps {
  feature: FeatureDetail;
}

export interface IntentPanelViewProps {
  architectureMap: FeatureDetail['architectureMap'];
  missingSections: string[];
  todoCount: number;
  sections: { title: string; body: string | null }[];
  decisions: FeatureDetail['decisions'];
}
