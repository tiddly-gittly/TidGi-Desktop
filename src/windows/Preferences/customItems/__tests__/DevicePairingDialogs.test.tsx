import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DevicePairingInviteDialog, normalizePairingInvitePayload } from '../DevicePairingDialogs';

describe('Device pairing dialogs', () => {
  it('shows the signed invitation payload and QR image', () => {
    render(
      <DevicePairingInviteDialog
        open
        payload='signed-invite'
        qrDataUrl='data:image/png;base64,qr'
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('device-pairing-invite-payload')).toHaveValue('signed-invite');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,qr');
  });

  it('normalizes pasted and scanned payloads before main-process verification', () => {
    expect(normalizePairingInvitePayload(' signed-invite ')).toBe('signed-invite');
    expect(() => normalizePairingInvitePayload('   ')).toThrow('pairing_invite_required');
  });
});
