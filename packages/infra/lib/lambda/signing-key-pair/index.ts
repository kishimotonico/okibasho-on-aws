import {
  DeleteParameterCommand,
  GetParameterCommand,
  ParameterType,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { createHandler } from './handler.js';

const ssm = new SSMClient({});

export const handler = createHandler({
  put: async (name, value, secure) => {
    await ssm.send(
      new PutParameterCommand({
        Name: name,
        Value: value,
        Type: secure ? ParameterType.SECURE_STRING : ParameterType.STRING,
        Overwrite: true,
      }),
    );
  },
  get: async (name) => {
    const output = await ssm.send(new GetParameterCommand({ Name: name }));
    const value = output.Parameter?.Value;
    if (!value) {
      throw new Error(`${name} が空です`);
    }
    return value;
  },
  delete: async (name) => {
    await ssm.send(new DeleteParameterCommand({ Name: name }));
  },
});
