import { AgentWithoutMessages } from '@/pages/Agent/store/agentChatStore/types';
import type { IChangeEvent } from '@rjsf/core';
import { ErrorSchema, RJSFValidationError } from '@rjsf/utils';
import { AgentInstance } from '@services/agentInstance/interface';
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { isEqual } from 'lodash';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UsePromptConfigFormProps {
  initialFormData?: HandlerConfig;
  schema?: Record<string, unknown>;
  onSubmit?: (formData: HandlerConfig) => void;
  onChange?: (formData: HandlerConfig) => void;
  onError?: (errors: ErrorSchema) => void;
  onUpdate?: (data: Partial<AgentInstance>) => Promise<void>;
  agent?: AgentWithoutMessages;
}

export const usePromptConfigForm = ({
  initialFormData,
  schema,
  onSubmit: externalSubmit,
  onChange: externalChange,
  onError: externalError,
  onUpdate,
  agent,
}: UsePromptConfigFormProps) => {
  const [validationErrors, setValidationErrors] = useState<ErrorSchema[]>([]);
  const [localFormData, setLocalFormData] = useState<HandlerConfig | undefined>(initialFormData);
  const [formKey, setFormKey] = useState<number>(0);

  // Use refs to track previous values and prevent unnecessary re-renders
  const previousFormDataReference = useRef<HandlerConfig | undefined>(undefined);
  const previousSchemaReference = useRef<Record<string, unknown> | undefined>(undefined);

  // Set form data from initial form data if provided - with deep comparison using lodash
  useEffect(() => {
    if (initialFormData && !isEqual(initialFormData, previousFormDataReference.current)) {
      setLocalFormData(initialFormData);
      previousFormDataReference.current = initialFormData;
    }
  }, [initialFormData]);

  // Force re-render only when schema significantly changes
  useEffect(() => {
    if (schema && !isEqual(schema, previousSchemaReference.current)) {
      setFormKey(previous => previous + 1);
      previousSchemaReference.current = schema;
    }
  }, [schema]);

  const handleChange = useCallback((event: IChangeEvent<HandlerConfig, Record<string, unknown>, Record<string, unknown>>) => {
    if (event.formData) {
      const updatedFormData: HandlerConfig = event.formData;
      setLocalFormData(updatedFormData);

      if (externalChange) {
        externalChange(updatedFormData);
      }
    }
  }, [externalChange]);

  const handleError = useCallback((errors: RJSFValidationError[]) => {
    const errorSchemas = errors.map(error => {
      const property = error.property || 'unknown';
      return { [property]: { __errors: [error.message] } } as ErrorSchema;
    });
    setValidationErrors(errorSchemas);

    if (externalError) {
      const combinedErrors = errors.reduce<ErrorSchema>((accumulator, error) => {
        const property = error.property || 'unknown';
        accumulator[property] = {
          __errors: [error.message || 'Unknown error'],
        } as ErrorSchema;
        return accumulator;
      }, {});
      externalError(combinedErrors);
    }
  }, [externalError]);

  const handleSubmit = useCallback(async (event: IChangeEvent<HandlerConfig, Record<string, unknown>, Record<string, unknown>>) => {
    try {
      if (event.formData) {
        const typedFormData: HandlerConfig = event.formData;
        if (externalSubmit) {
          externalSubmit(typedFormData);
        } else if (agent?.id && onUpdate) {
          await onUpdate({
            id: agent.id,
            handlerConfig: typedFormData,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to submit form data:', errorMessage);
    }
  }, [externalSubmit, agent?.id, onUpdate]);

  return {
    validationErrors,
    localFormData,
    formKey,
    handleChange,
    handleError,
    handleSubmit,
  };
};
