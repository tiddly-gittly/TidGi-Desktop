import { Helmet } from '@dr.pogodin/react-helmet';
import { styled } from '@mui/material/styles';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, DialogContent as DialogContentRaw, Typography } from '@mui/material';

const DialogContent = styled(DialogContentRaw)`
  min-width: 360px;
  max-width: 480px;
  padding: 24px;
`;

const Title = styled(Typography)`
  margin-bottom: 12px;
  font-weight: 600;
`;

const BulletList = styled('ul')`
  margin-top: 4px;
  margin-bottom: 8px;
  padding-left: 20px;
  & li {
    margin-bottom: 4px;
    line-height: 1.5;
  }
`;

const ButtonContainer = styled('div')`
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
`;

const DisableButton = styled(Button)`
  color: ${({ theme }) => theme.palette.text.secondary};
`;

export default function AnalyticsDisclosure(): React.JSX.Element {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mountedReference = useRef(true);
  useEffect(() => {
    return () => {
      mountedReference.current = false;
    };
  }, []);

  const handleResponse = async (enabled: boolean) => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await window.service.preference.set('analyticsEnabled', enabled);
      await window.service.analytics.recordDisclosureVersion();
      await window.service.analytics.track('analytics.disclosure_responded', { enabled });
      await window.service.window.close(window.meta().windowName);
    } catch {
      if (mountedReference.current) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <DialogContent>
      <Helmet>
        <title>{t('AnalyticsDisclosure.Title')}</title>
      </Helmet>

      <Title variant='h6'>{t('AnalyticsDisclosure.Title')}</Title>

      <Typography variant='body2' color='textSecondary' sx={{ mb: 1.5 }}>
        {t('AnalyticsDisclosure.Description')}
      </Typography>

      <Typography variant='body2' sx={{ mb: 0.5, fontWeight: 600 }}>
        {t('AnalyticsDisclosure.WeCollect')}
      </Typography>
      <BulletList>
        <li>
          <Typography variant='body2'>{t('AnalyticsDisclosure.CollectFeatureUsage')}</Typography>
        </li>
        <li>
          <Typography variant='body2'>{t('AnalyticsDisclosure.CollectPlatform')}</Typography>
        </li>
        <li>
          <Typography variant='body2'>{t('AnalyticsDisclosure.CollectErrors')}</Typography>
        </li>
      </BulletList>

      <Typography variant='body2' sx={{ mb: 0.5, mt: 2, fontWeight: 600 }}>
        {t('AnalyticsDisclosure.WeDoNotCollect')}
      </Typography>
      <BulletList>
        <li>
          <Typography variant='body2'>{t('AnalyticsDisclosure.NotCollectWikiContent')}</Typography>
        </li>
        <li>
          <Typography variant='body2'>{t('AnalyticsDisclosure.NotCollectPaths')}</Typography>
        </li>
        <li>
          <Typography variant='body2'>{t('AnalyticsDisclosure.NotCollectPersonalData')}</Typography>
        </li>
      </BulletList>

      <Typography variant='body2' color='textSecondary' sx={{ mt: 2 }}>
        {t('AnalyticsDisclosure.ChangeAnytime')}
      </Typography>

      <ButtonContainer>
        <DisableButton
          variant='text'
          disabled={isSubmitting}
          onClick={() => {
            void handleResponse(false);
          }}
        >
          {t('AnalyticsDisclosure.DisableAnalytics')}
        </DisableButton>
        <Button
          variant='contained'
          color='primary'
          disabled={isSubmitting}
          onClick={() => {
            void handleResponse(true);
          }}
        >
          {t('AnalyticsDisclosure.EnableAnalytics')}
        </Button>
      </ButtonContainer>
    </DialogContent>
  );
}
