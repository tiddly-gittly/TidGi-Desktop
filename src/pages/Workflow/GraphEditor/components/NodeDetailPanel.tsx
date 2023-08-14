/* eslint-disable unicorn/no-null */
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Avatar, Card, CardActions, CardContent, CardHeader, Collapse, IconButton, IconButtonProps, TextField } from '@mui/material';
import { red } from '@mui/material/colors';
import { IChangeEvent } from '@rjsf/core';
import Form from '@rjsf/mui';
import { RJSFSchema, UiSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import useDebouncedCallback from 'beautiful-react-hooks/useDebouncedCallback';
import { GraphNode } from 'fbp-graph/lib/Types';
import { JSONSchema7TypeName } from 'json-schema';
import { FC, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { IFBPLibrary, INoFloProtocolComponentPort, INoFloUIComponent, INoFloUIComponentPort } from 'the-graph';
import { FBPGraphReferenceContext } from '../hooks/useContext';
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

const generateSchemaFromPort = (port: INoFloUIComponentPort, options: { titleSuffix: string }): RJSFSchema => {
  return {
    title: `${port.name} (${options.titleSuffix})`,
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
          node={node.node}
          component={node.component}
          library={library}
        />
      ))}
    </ListContainer>
  );
};

interface NodeItemProps {
  component: INoFloUIComponent;
  library: IFBPLibrary;
  node: GraphNode;
}
const NodeItem: FC<NodeItemProps> = ({ node, component, library }) => {
  const { t } = useTranslation();
  const inPorts = component.inports ?? [];
  const inPortSchemas: RJSFSchema = {
    type: 'object',
    properties: Object.fromEntries(inPorts.map((port) => [port.name, generateSchemaFromPort(port, { titleSuffix: t('Workflow.InPort') })])),
  };
  const [moreFormExpanded, setMoreFormExpanded] = useState(false);
  const fbpGraphReference = useContext(FBPGraphReferenceContext);
  const initializers = fbpGraphReference?.current?.initializers;
  const inPortData = useMemo(() => {
    const nodeInitialData: Record<string, unknown> = {};
    initializers?.forEach?.(initialInformationPackets => {
      if (initialInformationPackets.to.node === node.id) {
        nodeInitialData[initialInformationPackets.to.port] = initialInformationPackets.from.data as unknown;
      }
    });
    return nodeInitialData;
  }, [node, initializers]);
  const handleInPortsChange = useDebouncedCallback((data: IChangeEvent<any, RJSFSchema, any>, id?: string | undefined) => {
    const fbpGraph = fbpGraphReference?.current;
    if (fbpGraph === undefined) return;
    /**
     * Input data is flattened, even you want to input an Object, it will be just string.
     */
    const formData = data.formData as Record<string, unknown>;
    Object.entries(formData).forEach(([key, value]) => {
      if (value === undefined) return;
      fbpGraph.removeInitial(node.id, key);
      fbpGraph.addInitial(value, node.id, key);
    });
  }, [fbpGraphReference, node.id]);

  return (
    <ItemContainer>
      <CardHeader
        avatar={
          <Avatar sx={{ bgcolor: red[500] }} aria-label='recipe'>
            <NoFloIcon icon={component.icon} />
          </Avatar>
        }
        title={<TextField value={node.metadata?.label as string ?? ''} label={t('Workflow.NodeLabel')} />}
      />
      <CardContent>
        <SearchComponentsAutocomplete
          label={t('Workflow.CurrentNodeComponentType')}
          library={library}
          onClick={(component) => {}}
          variant='standard'
          defaultValue={node.component}
        />
        <Form formData={inPortData} schema={inPortSchemas} validator={validator} uiSchema={uiSchema} onChange={handleInPortsChange} />
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
          {(node.metadata !== undefined) && <Form schema={generateSchemaForMetadata(node.metadata)} validator={validator} uiSchema={uiSchema} />}
        </CardContent>
      </Collapse>
    </ItemContainer>
  );
};
