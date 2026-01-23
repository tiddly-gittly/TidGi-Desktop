import { Chip } from '@mui/material';
import defaultProvidersConfig from '@services/externalAPI/defaultProviders';
import { ModelFeature } from '@services/externalAPI/interface';
import { useTranslation } from 'react-i18next';

export function ModelFeatureChip({ feature }: { feature: ModelFeature | string }) {
  const { t } = useTranslation('agent');

  const getFeatureLabel = (featureValue: string) => {
    const featureDef = defaultProvidersConfig.modelFeatures.find(f => f.value === featureValue);
    if (featureDef) {
      // featureDef.i18nKey is "ModelFeature.Language" etc.
      // pass it to t()
      return t(featureDef.i18nKey);
    }
    return featureValue;
  };

  return (
    <Chip
      label={getFeatureLabel(feature)}
      size='small'
      variant='outlined'
      sx={{ fontSize: '0.7rem', height: 20 }}
    />
  );
}
