import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Segmented, Tooltip } from 'antd';

import type { ThemePreference } from '@domain/repositories';
import type { ThemeSwitchViewProps } from './theme-switch.props';

export function ThemeSwitchView({ preference, onChange }: ThemeSwitchViewProps) {
  return (
    <Segmented
      size="small"
      value={preference}
      onChange={(value) => onChange(value as ThemePreference)}
      options={[
        { value: 'light', label: <Tooltip title="Light"><SunOutlined /></Tooltip> },
        { value: 'system', label: <Tooltip title="Follow the system"><DesktopOutlined /></Tooltip> },
        { value: 'dark', label: <Tooltip title="Dark"><MoonOutlined /></Tooltip> },
      ]}
    />
  );
}
