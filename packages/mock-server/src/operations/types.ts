import type { OperationName, Operations, OperationOutput, z } from '@travelta/schemas';
import type { RequestContext } from '../context';

export type HandlerInput<N extends OperationName> = z.output<Operations[N]['input']>;
export type Handler<N extends OperationName> = (ctx: RequestContext, input: HandlerInput<N>) => Promise<OperationOutput<N>> | OperationOutput<N>;
export type HandlerMap<N extends OperationName = OperationName> = { [K in N]: Handler<K> };
