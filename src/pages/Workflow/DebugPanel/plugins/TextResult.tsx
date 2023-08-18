import { IResultTextProps } from '@/pages/Workflow/libs/ui/types/UIEffectsContext';
import { Card, CardContent, Typography } from '@mui/material';
import { useRenderWikiText } from '@services/wiki/hooks';
import { styled } from 'styled-components';
import type { UIPlugin } from '.';

const ContainerCard = styled(Card)`
  margin-bottom: ${({ theme }) => theme.workflow.debugPanel.cardSpacing}px;
`;
const TextContent = styled(Typography)`
  user-select: text;
`;

function Component({ content }: IResultTextProps) {
  const renderedTextHtml = useRenderWikiText(content);
  return (
    <ContainerCard>
      <CardContent>
        <TextContent>
          {renderedTextHtml.length > 0 ? <div dangerouslySetInnerHTML={{ __html: renderedTextHtml }} /> : <div>{content}</div>}
        </TextContent>
      </CardContent>
    </ContainerCard>
  );
}
export const TextResultPlugin: UIPlugin = {
  type: 'textResult',
  Component,
};
