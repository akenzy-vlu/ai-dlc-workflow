import { UserOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import { IdentityPrompt } from '../identity-prompt';
import type { ActorButtonViewProps } from './actor-button.props';

export function ActorButtonView({
  label,
  hasActor,
  onOpen,
  promptOpen,
  onClosePrompt,
}: ActorButtonViewProps) {
  return (
    <>
      <Button size="small" icon={<UserOutlined />} onClick={onOpen} type={hasActor ? 'default' : 'primary'}>
        {label}
      </Button>
      <IdentityPrompt open={promptOpen} onClose={onClosePrompt} />
    </>
  );
}
