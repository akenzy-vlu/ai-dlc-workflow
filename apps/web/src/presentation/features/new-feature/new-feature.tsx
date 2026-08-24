import { useState } from 'react';
import { App, Form } from 'antd';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@app/router/routes';
import { featureRepository, portfolioRepository } from '@data/repositories';
import type { NewFeatureFormValues, NewFeatureProps } from './new-feature.props';
import { NewFeatureView } from './new-feature.view';

export function NewFeatureModal({ open, onClose }: NewFeatureProps) {
  const [form] = Form.useForm<NewFeatureFormValues>();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const repositories = portfolioRepository.useRepositories();
  const create = featureRepository.useCreateFeature();
  const [step, setStep] = useState(0);

  const slug = Form.useWatch('slug', form);
  const repositoryId = Form.useWatch('repositoryId', form);

  const close = (): void => {
    form.resetFields();
    setStep(0);
    onClose();
  };

  return (
    <NewFeatureView
      open={open}
      step={step}
      form={form}
      repositories={repositories.data ?? []}
      repositoriesLoading={repositories.isLoading}
      selectedRepository={(repositories.data ?? []).find((repository) => repository.id === repositoryId)}
      slug={slug}
      creating={create.isPending}
      onClose={close}
      onBack={() => setStep((current) => current - 1)}
      onNext={() => {
        void form
          .validateFields(step === 0 ? ['repositoryId', 'slug'] : ['problem', 'successSignal'])
          .then(() => setStep((current) => current + 1))
          .catch(() => undefined /* antd surfaces the field errors */);
      }}
      onSubmit={(values) => {
        void create
          .run({
            repositoryId: values.repositoryId,
            slug: values.slug,
            intent: {
              problem: values.problem,
              successSignal: values.successSignal,
              outOfScope: (values.outOfScope ?? '')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
              constraints: values.constraints ?? '',
            },
          })
          .then((result) => {
            message.success(`created ${result.slug}`);
            close();
            navigate(ROUTES.feature(result.repositoryId, result.slug));
          })
          .catch((error: Error) => message.error(error.message));
      }}
    />
  );
}
