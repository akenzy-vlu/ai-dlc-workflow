import type { Repository } from '@domain/entities';

export interface NewFeatureProps {
  open: boolean;
  onClose: () => void;
}

export interface NewFeatureFormValues {
  repositoryId: string;
  slug: string;
  problem: string;
  successSignal: string;
  outOfScope: string;
  constraints: string;
}

export interface NewFeatureViewProps {
  open: boolean;
  step: number;
  repositories: Repository[];
  repositoriesLoading: boolean;
  selectedRepository: Repository | undefined;
  slug: string | undefined;
  creating: boolean;
  form: import('antd').FormInstance<NewFeatureFormValues>;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  onSubmit: (values: NewFeatureFormValues) => void;
}
