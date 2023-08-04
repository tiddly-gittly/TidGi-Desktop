// Load the NoFlo interface
import { Component } from 'noflo';
// Also load any other dependencies you have

// Implement the getComponent function that NoFlo's component loader
// uses to instantiate components to the program
export const getComponent = (): Component => {
  // Start by instantiating a component
  const c = new Component();

  // Provide some metadata, including icon for visual editors
  c.description = 'Call local Llama model';
  c.icon = 'file';

  // Declare the ports you want your component to have, including
  // their data types
  c.inPorts.add('in', {
    datatype: 'string',
  });
  c.outPorts.add('out', {
    datatype: 'string',
  });
  c.outPorts.add('error', {
    datatype: 'object',
  });

  // Implement the processing function that gets called when the
  // inport buffers have packets available
  c.process((input, output) => {
    // Precondition: check that the "in" port has a data packet.
    // Not necessary for single-inport components but added here
    // for the sake of demonstration
    if (!input.hasData('in')) {
      return;
    }

    // DEBUG: console input
    console.log(`input`, input);

    // Send the file contents to the "out" port
    output.send({
      out: input,
    });
    // Tell NoFlo we've finished processing
    output.done();
  });

  // Finally return to component to the loader
  return c;
};
