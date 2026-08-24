import type { DisplayControlProps } from './display-control.props';
import { DisplayControlView } from './display-control.view';

export function DisplayControl(props: DisplayControlProps) {
  return <DisplayControlView {...props} />;
}
