import { useEffect, useRef, useState } from 'react';
import { App } from 'antd';

import { setupLogCleared, useAppDispatch, useAppSelector } from '@app/store';
import { portfolioRepository, runnerRepository } from '@data/repositories';
import { SetupPageView } from './setup-page.view';

export function SetupPage() {
  const { message } = App.useApp();
  const dispatch = useAppDispatch();
  const runner = runnerRepository.useRunner();
  const tooling = portfolioRepository.useTooling();
  const install = runnerRepository.useInstallRunner();
  const useInterpreter = runnerRepository.useUseInterpreter();

  const log = useAppSelector((state) => state.stream.setupLog);
  const stepStates = useAppSelector((state) => state.stream.setupSteps);

  const [manualPath, setManualPath] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log.length]);

  return (
    <SetupPageView
      runner={runner.data}
      tooling={tooling.data}
      checking={runner.isFetching}
      installing={install.isPending}
      applyingInterpreter={useInterpreter.isPending}
      stepStates={stepStates}
      log={log}
      logRef={logRef}
      manualPath={manualPath}
      confirmOpen={confirmOpen}
      onManualPathChange={setManualPath}
      onRecheck={runner.refetch}
      onOpenConfirm={() => setConfirmOpen(true)}
      onCloseConfirm={() => setConfirmOpen(false)}
      onUseInterpreter={(path) => {
        void useInterpreter
          .run(path)
          .then((status) =>
            message.success(
              status.ready ? 'runner is ready' : 'interpreter set, but something is still missing',
            ),
          )
          .catch((error: Error) => message.error(error.message));
      }}
      onInstall={() => {
        void install
          .run()
          .then((result) => {
            if (!result.started) {
              message.info(result.reason ?? 'already running');
              return;
            }
            dispatch(setupLogCleared());
            setConfirmOpen(false);
            message.loading('installing — progress appears below', 3);
          })
          .catch((error: Error) => message.error(error.message));
      }}
    />
  );
}
