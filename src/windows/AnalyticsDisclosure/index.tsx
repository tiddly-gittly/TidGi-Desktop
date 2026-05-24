import { Helmet } from '@dr.pogodin/react-helmet';
import { styled } from '@mui/material/styles';
import React, { useState } from 'react';

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
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setIsSubmitting(false);
    }
  };

  return (
    <DialogContent>
      <Helmet>
        <title>Analytics Data Collection</title>
      </Helmet>

      <Title variant='h6'>Help Improve TidGi</Title>

      <Typography variant='body2' color='textSecondary' sx={{ mb: 1.5 }}>
        We collect anonymous usage data to help improve TidGi. Your privacy is our priority.
      </Typography>

      <Typography variant='body2' sx={{ mb: 0.5, fontWeight: 600 }}>
        We collect:
      </Typography>
      <BulletList>
        <li><Typography variant='body2'>Feature usage counts (e.g., how often sync is triggered)</Typography></li>
        <li><Typography variant='body2'>App version and platform (Windows, macOS, Linux)</Typography></li>
        <li><Typography variant='body2'>Error reports to help fix bugs faster</Typography></li>
      </BulletList>

      <Typography variant='body2' sx={{ mb: 0.5, mt: 2, fontWeight: 600 }}>
        We do NOT collect:
      </Typography>
      <BulletList>
        <li><Typography variant='body2'>Your wiki content or tiddler text</Typography></li>
        <li><Typography variant='body2'>File paths from your computer</Typography></li>
        <li><Typography variant='body2'>Any personal data (names, emails, IPs)</Typography></li>
      </BulletList>

      <Typography variant='body2' color='textSecondary' sx={{ mt: 2 }}>
        You can change this anytime in Preferences &gt; Privacy.
      </Typography>

      <ButtonContainer>
        <DisableButton
          variant='text'
          disabled={isSubmitting}
          onClick={() => {
            void handleResponse(false);
          }}
        >
          Disable Analytics
        </DisableButton>
        <Button
          variant='contained'
          color='primary'
          disabled={isSubmitting}
          onClick={() => {
            void handleResponse(true);
          }}
        >
          Enable Analytics
        </Button>
      </ButtonContainer>
    </DialogContent>
  );
}
