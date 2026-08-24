import { Alert, Form, Input, Modal, Select, Steps, Typography } from 'antd';

import { MONO_FONT, token } from '@app/theme';
import type { NewFeatureFormValues, NewFeatureViewProps } from './new-feature.props';

/**
 * Asks for the four things G0 will refuse without.
 *
 * That is the whole reason to have a dialog rather than a "create" button: the questions
 * are the value, and asking them at the only moment anyone has the context is what stops
 * a plan from starting life as four TODO placeholders.
 */
export function NewFeatureView({
  open,
  step,
  repositories,
  repositoriesLoading,
  selectedRepository,
  slug,
  creating,
  form,
  onNext,
  onBack,
  onClose,
  onSubmit,
}: NewFeatureViewProps) {
  return (
    <Modal
      open={open}
      title="New feature"
      width={620}
      onCancel={onClose}
      okText={step === 2 ? 'Create' : 'Continue'}
      confirmLoading={creating}
      onOk={() => (step === 2 ? form.submit() : onNext())}
      cancelText={step === 0 ? 'Cancel' : 'Back'}
      cancelButtonProps={{ onClick: step === 0 ? onClose : onBack }}
    >
      <Steps
        size="small"
        current={step}
        style={{ marginBottom: 18 }}
        items={[{ title: 'Where' }, { title: 'Why' }, { title: 'Edges' }]}
      />

      <Form<NewFeatureFormValues> form={form} layout="vertical" onFinish={onSubmit}>
        <div style={{ display: step === 0 ? 'block' : 'none' }}>
          <Form.Item
            name="repositoryId"
            label="Repository"
            rules={[{ required: true, message: 'Pick the repository this feature belongs to' }]}
          >
            <Select
              placeholder="Which checkout?"
              loading={repositoriesLoading}
              options={repositories.map((repository) => ({
                value: repository.id,
                label: repository.label,
                disabled: !repository.configured,
              }))}
              optionRender={(option) => {
                const repository = repositories.find((candidate) => candidate.id === option.value);
                return (
                  <div>
                    <div>{repository?.label}</div>
                    <div style={{ fontSize: 11, color: token.textSecondary }}>
                      {repository?.configured
                        ? `${repository.layers.join(', ') || 'no layers declared'} · profile ${repository.profile}`
                        : 'no .ai/aidlc.yaml — configure the repository first'}
                    </div>
                  </div>
                );
              }}
            />
          </Form.Item>

          <Form.Item
            name="slug"
            label="Slug"
            extra="Becomes the directory name and the feature's identity everywhere afterwards. Lowercase, hyphens."
            rules={[
              { required: true, message: 'A slug is required' },
              { pattern: /^[a-z0-9][a-z0-9-]*$/, message: 'Lowercase letters, digits and hyphens only' },
            ]}
          >
            <Input placeholder="pos-refund-split" />
          </Form.Item>

          {selectedRepository && slug ? (
            <Alert
              type="info"
              message={
                <span style={{ fontFamily: MONO_FONT, fontSize: 11.5 }}>
                  {selectedRepository.absolutePath}/.ai/features/{slug}
                </span>
              }
            />
          ) : null}
        </div>

        <div style={{ display: step === 1 ? 'block' : 'none' }}>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            G0 refuses a feature whose intent still holds placeholders. These two answers are what it
            checks for, and they are much easier to write now than a week from now.
          </Typography.Paragraph>
          <Form.Item
            name="problem"
            label="What problem, and for whom?"
            rules={[{ required: true, min: 10, message: 'Say what actually hurts, and to whom' }]}
          >
            <Input.TextArea rows={4} placeholder="Cashiers cannot split a refund across two tenders, so…" />
          </Form.Item>
          <Form.Item
            name="successSignal"
            label="One measurable success signal"
            extra="Something you could check afterwards and be wrong about."
            rules={[{ required: true, min: 6, message: 'One signal, measurable' }]}
          >
            <Input.TextArea rows={2} placeholder="Refund voids drop from ~12/day to under 2/day" />
          </Form.Item>
        </div>

        <div style={{ display: step === 2 ? 'block' : 'none' }}>
          <Form.Item
            name="outOfScope"
            label="Out of scope"
            extra="One per line. What you are deliberately not doing is half of what makes a plan reviewable."
          >
            <Input.TextArea rows={4} placeholder={'Refund approval workflow\nAnything touching the tax engine'} />
          </Form.Item>
          <Form.Item name="constraints" label="Constraints" extra="Deadlines, external dependencies, anything fixed.">
            <Input.TextArea rows={3} placeholder="Must ship before the Q3 tax change on 1 Oct" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
