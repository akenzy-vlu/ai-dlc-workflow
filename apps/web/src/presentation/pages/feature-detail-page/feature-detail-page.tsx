import { useState } from 'react';
import { App } from 'antd';
import { useParams, useSearchParams } from 'react-router-dom';

import { featureRepository } from '@data/repositories';
import type { ControllerOutcome } from '@domain/entities';
import type { FeatureTool } from './feature-detail-page.props';
import { FeatureDetailPageView } from './feature-detail-page.view';

const TOOL_TITLES: Record<FeatureTool, string> = {
  regenerate: 'uow_graph.py --write',
  validate: 'uow_graph.py (validate only)',
  lintTouches: 'aidlc lint-touches',
};

export function FeatureDetailPage() {
  const { repositoryId = '', slug = '' } = useParams();
  // The tab lives in the URL so search results and inbox items can deep-link to the one
  // that answers the question they came from.
  const [params, setParams] = useSearchParams();
  const { message } = App.useApp();

  const ref = { repositoryId, slug };
  const feature = featureRepository.useFeature(repositoryId && slug ? ref : null);
  const regenerate = featureRepository.useRegenerate();
  const validate = featureRepository.useValidateGraph();
  const lintTouches = featureRepository.useLintTouches();

  const [outcome, setOutcome] = useState<{ title: string; result: ControllerOutcome } | null>(null);
  const [openDocumentName, setOpenDocumentName] = useState<string | null>(null);
  const document = featureRepository.useDocument(openDocumentName ? ref : null, openDocumentName);

  const commands: Record<FeatureTool, typeof regenerate> = { regenerate, validate, lintTouches };

  return (
    <FeatureDetailPageView
      feature={feature.data}
      loading={feature.isLoading}
      fetching={feature.isFetching}
      error={feature.error}
      activeTab={params.get('tab') ?? 'units'}
      toolRunning={regenerate.isPending || validate.isPending || lintTouches.isPending}
      outcome={outcome}
      document={document.data}
      documentLoading={document.isLoading}
      openDocumentName={openDocumentName}
      onTabChange={(tab) => setParams(tab === 'units' ? {} : { tab })}
      onReload={feature.refetch}
      onCloseOutcome={() => setOutcome(null)}
      onOpenDocument={setOpenDocumentName}
      onCloseDocument={() => setOpenDocumentName(null)}
      onRunTool={(tool) => {
        void commands[tool]
          .run(ref)
          .then((result) => setOutcome({ title: TOOL_TITLES[tool], result }))
          .catch((error: Error) => message.error(error.message));
      }}
    />
  );
}
