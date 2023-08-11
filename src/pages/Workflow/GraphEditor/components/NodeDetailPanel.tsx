/* eslint-disable unicorn/no-null */
import Form from '@rjsf/core';
import { RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { GraphNode } from 'fbp-graph/lib/Types';
import { FC } from 'react';
import { IFBPLibrary, INoFloUIComponentPort } from 'the-graph';
import { useSelectedNodeComponent } from '../hooks/useSelectedNodeComponent';

interface NodeDetailPanelProps {
  library: IFBPLibrary;
  selectedNodes: GraphNode[];
}

const generateSchemaFromPort = (port: INoFloUIComponentPort): RJSFSchema => {
  return {
    title: port.name,
    type: port.type,
    default: port.default,
    enum: Array.isArray(port.values) ? port.values : undefined,
    description: port.description,
  };
};

export const NodeDetailPanel: FC<NodeDetailPanelProps> = ({ selectedNodes, library }) => {
  const nodes = useSelectedNodeComponent(selectedNodes, library);
  if (selectedNodes.length === 0) return null;

  const selectedNode = nodes[0];
  const inports = selectedNode.component.inports ?? [];
  const outports = selectedNode.component.outports ?? [];

  const inportSchemas = inports.map(port => generateSchemaFromPort(port));
  const outportSchemas = outports.map(port => generateSchemaFromPort(port));

  return (
    <div>
      <h3>Inports</h3>
      {inportSchemas.map((schema, index) => (
        <div key={index}>
          <Form schema={schema} validator={validator} />
        </div>
      ))}

      <h3>Outports</h3>
      {outportSchemas.map((schema, index) => (
        <div key={index}>
          <Form schema={schema} validator={validator} />
        </div>
      ))}
    </div>
  );
};
