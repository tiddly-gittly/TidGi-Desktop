import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface DeleteConfirmationDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
}

export const DeleteConfirmationDialog = ({
  open,
  onCancel,
  onConfirm,
}: DeleteConfirmationDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>{t('Workflow.DeleteWorkflow')}</DialogTitle>
      <DialogContent>
        <Typography>{t('Workflow.DeleteWorkflowDescription')}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t('No')}</Button>
        <Button onClick={onConfirm}>{t('Yes')} {t('Delete')}</Button>
      </DialogActions>
    </Dialog>
  );
};
