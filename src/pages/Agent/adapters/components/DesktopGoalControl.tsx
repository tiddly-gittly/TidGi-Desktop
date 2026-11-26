import { getGoalPanelLabels, GoalDialog } from '@memeloop/react-ui/agent';
import { Button } from '@mui/material';
import type { GoalClient } from 'memeloop';
import React, { type ComponentProps, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { catchError, filter, from, of, startWith, switchMap } from 'rxjs';

import { handleDesktopAgentErrorAction } from '../openAgentRunErrorSettings';

type DesktopGoalControlProps = Pick<ComponentProps<typeof GoalDialog>, 'conversationId' | 'definitionId' | 'resolveErrorPresentation'>;

const goalClient: GoalClient = {
  get: conversationId => window.service.agentInstance.getGoal(conversationId),
  start: input => window.service.agentInstance.startGoal(input),
  pause: input => window.service.agentInstance.pauseGoal(input),
  resume: input => window.service.agentInstance.resumeGoal(input),
  complete: input => window.service.agentInstance.completeGoal(input),
};

export function DesktopGoalControl({ conversationId, definitionId, resolveErrorPresentation }: DesktopGoalControlProps) {
  const { i18n } = useTranslation('agent');
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const labels = getGoalPanelLabels(i18n.language);

  useEffect(() => {
    const subscription = window.observables.agentDefinition.workflowChanged$.pipe(
      filter(id => id === definitionId),
      startWith(definitionId),
      switchMap(() =>
        from(window.service.agentInstance.supportsConversationGoal(conversationId)).pipe(
          catchError((error: unknown) => {
            void window.service.native.log('warn', 'Workflow capability lookup failed', { conversationId, error });
            return of(false);
          }),
        )
      ),
    ).subscribe(supportsGoal => {
      setSupported(supportsGoal);
      if (!supportsGoal) setOpen(false);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [conversationId, definitionId]);

  if (!supported) return null;
  return (
    <>
      <Button
        size='small'
        onClick={() => {
          setOpen(true);
        }}
      >
        {labels.title}
      </Button>
      {open && (
        <GoalDialog
          client={goalClient}
          conversationId={conversationId}
          definitionId={definitionId}
          labels={labels}
          resolveErrorPresentation={resolveErrorPresentation}
          onErrorAction={handleDesktopAgentErrorAction}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
