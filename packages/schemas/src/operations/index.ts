import type { z } from 'zod';
import type { OperationDef } from './define';
import { authOperations } from './auth';
import { demoOperations } from './demo';
import { referenceOperations } from './reference';
import { teamOperations } from './team';
import { organizationOperations } from './organizations';
import { kycOperations } from './kyc';
import { pricingOperations } from './pricing';
import { catalogOperations } from './catalog';
import { searchOperations } from './search';
import { bookingOperations } from './booking';
import { financeOperations } from './finance';
import { crmOperations } from './crm';
import { subscriptionOperations } from './subscriptions';
import { notificationOperations } from './notifications';
import { reportOperations } from './reports';
import { accountOperations } from './account';
import { storefrontOperations } from './storefront';
import { locationOperations } from './locations';

export * from './auth';
export * from './define';
export * from './demo';
export * from './reference';
export * from './team';
export * from './organizations';
export * from './kyc';
export * from './pricing';
export * from './catalog';
export * from './search';
export * from './booking';
export * from './finance';
export * from './crm';
export * from './subscriptions';
export * from './notifications';
export * from './reports';
export * from './account';
export * from './storefront';
export * from './locations';

/** The full operation catalogue. Each milestone adds its feature's operations here. */
export const operations = {
  ...demoOperations,
  ...referenceOperations,
  ...authOperations,
  ...teamOperations,
  ...organizationOperations,
  ...kycOperations,
  ...pricingOperations,
  ...catalogOperations,
  ...searchOperations,
  ...bookingOperations,
  ...financeOperations,
  ...crmOperations,
  ...subscriptionOperations,
  ...notificationOperations,
  ...reportOperations,
  ...accountOperations,
  ...storefrontOperations,
  ...locationOperations,
} as const satisfies Record<string, OperationDef>;

export type Operations = typeof operations;
export type OperationName = keyof Operations;
export type OperationInput<N extends OperationName> = z.input<Operations[N]['input']>;
export type OperationOutput<N extends OperationName> = z.output<Operations[N]['output']>;
