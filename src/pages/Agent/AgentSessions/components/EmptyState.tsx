import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: ${props => props.theme.palette.text.secondary};
  text-align: center;
  padding: 32px;
`;

const Heading = styled.h3`
  margin-bottom: 8px;
  color: ${props => props.theme.palette.text.primary};
`;

const Text = styled.p`
  max-width: 400px;
  color: ${props => props.theme.palette.text.secondary};
`;

interface EmptyStateProps {
  heading: string;
  description: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ heading, description }) => {
  return (
    <Container>
      <Heading>{heading}</Heading>
      <Text>{description}</Text>
    </Container>
  );
};
