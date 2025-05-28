import { ArrayFieldTemplateProps } from '@rjsf/utils';
import React from 'react';

export const ArrayFieldTemplate: React.FC<ArrayFieldTemplateProps> = (props) => {
  const { items, onAddClick, canAdd, title } = props;

  return (
    <div>
      {title && <h3>{title}</h3>}
      {items.map((element) => (
        <div key={element.key} style={{ marginBottom: '1rem' }}>
          {element.children}
        </div>
      ))}
      {canAdd && (
        <button type='button' onClick={onAddClick}>
          Add Item
        </button>
      )}
    </div>
  );
};
