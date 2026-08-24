import type { ControllerOutputProps } from './controller-output.props';
import { ControllerOutputView } from './controller-output.view';

export function ControllerOutput(props: ControllerOutputProps) {
  return <ControllerOutputView {...props} />;
}
