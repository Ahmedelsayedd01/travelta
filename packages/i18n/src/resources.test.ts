import { describe, expect, it } from 'vitest';
import * as c from '@travelta/contracts';
import { resources } from './index';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) };
  }, {});
}

const en = flatten(resources.en as unknown as Tree);
const ar = flatten(resources.ar as unknown as Tree);
const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort();

describe('i18n resources', () => {
  it('has the same keys in English and Arabic', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps ICU placeholders identical across locales', () => {
    for (const key of Object.keys(en)) expect(placeholders(ar[key] ?? ''), key).toEqual(placeholders(en[key] ?? ''));
  });

  it('has no empty strings', () => {
    for (const [k, v] of Object.entries({ ...en, ...ar })) expect(v.trim(), k).not.toBe('');
  });

  it('labels every enum value', () => {
    const enums: Record<string, readonly string[]> = {
      serviceType: c.SERVICE_TYPES, inventorySource: c.INVENTORY_SOURCES, supplierOwnership: c.SUPPLIER_OWNERSHIPS,
      orgType: c.ORG_TYPES, orgStatus: c.ORG_STATUSES, userType: c.USER_TYPES, channel: c.CHANNELS,
      bookingItemStatus: c.BOOKING_ITEM_STATUSES, holdReason: c.HOLD_REASONS, paymentType: c.PAYMENT_TYPES,
      paymentMethod: c.PAYMENT_METHODS, paymentStatus: c.PAYMENT_STATUSES, installmentStatus: c.INSTALLMENT_STATUSES,
      invoiceStatus: c.INVOICE_STATUSES, requestStage: c.REQUEST_STAGES, leadStatus: c.LEAD_STATUSES, priority: c.PRIORITIES,
      kycCaseStatus: c.KYC_CASE_STATUSES, kycDocType: c.KYC_DOC_TYPES, kycDocStatus: c.KYC_DOC_STATUSES,
      markupLayer: c.MARKUP_LAYERS, markupMode: c.MARKUP_MODES, subscriptionStatus: c.SUBSCRIPTION_STATUSES,
      unitType: c.UNIT_TYPES, paxType: c.PAX_TYPES, locale: c.LOCALES,
    };
    for (const [name, values] of Object.entries(enums)) {
      for (const v of values) expect(en[`enums.${name}.${v}`], `enums.${name}.${v}`).toBeTruthy();
    }
  });

  it('has a message for every API error code', () => {
    for (const code of c.ERROR_CODES) expect(en[`errors.${code}`], code).toBeTruthy();
  });
});
