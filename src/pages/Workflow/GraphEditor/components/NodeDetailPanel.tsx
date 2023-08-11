/* eslint-disable unicorn/no-null */
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Avatar, Card, CardActions, CardContent, CardHeader, Collapse, IconButton, IconButtonProps, TextField, Typography } from '@mui/material';
import { red } from '@mui/material/colors';
import Form from '@rjsf/mui';
import { RJSFSchema, UiSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { GraphNode } from 'fbp-graph/lib/Types';
import { JSONSchema7TypeName } from 'json-schema';
import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { IFBPLibrary, INoFloProtocolComponentPort, INoFloUIComponent, INoFloUIComponentPort } from 'the-graph';
import { useSelectedNodeComponent } from '../hooks/useSelectedNodeComponent';
import { NoFloIcon } from './NoFloIcon';
import { SearchComponentsAutocomplete } from './SearchComponents';

const ListContainer = styled.div`
  display: flex;
  flex-direction: column;
  `;
const ItemContainer = styled(Card)`
  display: flex;
  flex-direction: column;
  margin-top: 0.3em;
  & .rjsf .MuiGrid-item {
    padding-top: 0;
  }
`;
interface ExpandMoreProps extends IconButtonProps {
  expand: boolean;
}

const ExpandMore = styled((props: ExpandMoreProps) => {
  const { expand, ...other } = props;
  return <IconButton {...other} />;
})(({ theme, expand }) => ({
  transform: expand ? 'rotate(180deg)' : 'rotate(0deg)',
  marginLeft: 'auto',
  transition: theme.transitions.create('transform', {
    duration: theme.transitions.duration.shortest,
  }),
}));

const uiSchema: UiSchema = {
  'ui:submitButtonOptions': {
    props: {
      disabled: true,
    },
    norender: true,
  },
};

interface NodeDetailPanelProps {
  library: IFBPLibrary;
  selectedNodes: GraphNode[];
}

/**
 * noflo's port can have type like 'all' or 'int' or 'bang', which is not exist in json schema, we transform them to appropriate type.
 */
const nofloPortTypeToRJSFType = (type: INoFloProtocolComponentPort['type']): JSONSchema7TypeName => {
  switch (type) {
    case 'all': {
      return 'string';
    }
    case 'int': {
      return 'number';
    }
    case 'bang': {
      return 'boolean';
    }
    default: {
      return type;
    }
  }
};

const generateSchemaFromPort = (port: INoFloUIComponentPort): RJSFSchema => {
  return {
    type: nofloPortTypeToRJSFType(port.type),
    default: port.default,
    enum: Array.isArray(port.values) ? port.values : undefined,
    description: port.description,
  };
};
const generateSchemaForMetadata = (metadata: Record<string, unknown>): RJSFSchema => {
  // json schema to edit height, label, width, x, y
  return {
    title: 'metadata',
    type: 'object',
    properties: {
      height: {
        type: 'number',
        default: metadata.height as number | undefined,
      },
      width: {
        type: 'number',
        default: metadata.width as number | undefined,
      },
      x: {
        type: 'number',
        default: metadata.x as number | undefined,
      },
      y: {
        type: 'number',
        default: metadata.y as number | undefined,
      },
    },
  };
};

export const NodeDetailPanel: FC<NodeDetailPanelProps> = ({ selectedNodes, library }) => {
  const nodes = useSelectedNodeComponent(selectedNodes, library);
  if (selectedNodes.length === 0) return null;

  return (
    <ListContainer>
      {nodes.map((node) => (
        <NodeItem
          key={node.node.id}
          node={node}
          library={library}
        />
      ))}
    </ListContainer>
  );
};

interface NodeItemProps {
  library: IFBPLibrary;
  node: {
    component: INoFloUIComponent;
    node: GraphNode;
  };
}
const NodeItem: FC<NodeItemProps> = ({ node, library }) => {
  const { t } = useTranslation();
  const inPorts = node.component.inports ?? [];
  const inPortSchemas: RJSFSchema = {
    type: 'object',
    properties: Object.fromEntries(inPorts.map((port) => [`${t('Workflow.InPort')} ${port.name}`, generateSchemaFromPort(port)])),
  };
  const [moreFormExpanded, setMoreFormExpanded] = useState(false);

  return (
    <ItemContainer>
      <CardHeader
        avatar={
          <Avatar sx={{ bgcolor: red[500] }} aria-label='recipe'>
            <NoFloIcon icon={node.component.icon} />
          </Avatar>
        }
        title={<TextField value={node.node.metadata?.label as string ?? ''} label={t('Workflow.NodeLabel')} />}
      />
      <CardContent>
        <SearchComponentsAutocomplete
          label={t('Workflow.CurrentNodeComponentType')}
          library={library}
          onClick={(component) => {}}
          variant='standard'
          defaultValue={node.node.component}
        />
        <Form schema={inPortSchemas} validator={validator} uiSchema={uiSchema} />
      </CardContent>
      <CardActions disableSpacing>
        <IconButton aria-label='delete'>
          <DeleteIcon />
        </IconButton>
        <ExpandMore
          expand={moreFormExpanded}
          onClick={() => {
            setMoreFormExpanded(!moreFormExpanded);
          }}
          aria-expanded={moreFormExpanded}
          aria-label='show more'
        >
          <ExpandMoreIcon />
        </ExpandMore>
      </CardActions>
      <Collapse in={moreFormExpanded} timeout='auto' unmountOnExit>
        <CardContent>
          {(node.node.metadata !== undefined) && <Form schema={generateSchemaForMetadata(node.node.metadata)} validator={validator} uiSchema={uiSchema} />}
        </CardContent>
      </Collapse>
    </ItemContainer>
  );
};
