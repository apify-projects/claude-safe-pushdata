import type { ChargeResult } from 'apify';
import { Actor, log } from 'apify';

import { pushDataWithSchemaRepair } from '../push-data-with-schema-repair/index.js';

// Actor.pushData(items, eventName)'s resolved value when every item got
// dropped and the push itself never ran — mirrors what a charge-less push
// would report, so callers checking `chargeableWithinLimit` don't crash on
// a missing result.
const NO_CHARGE_RESULT: ChargeResult = {
    eventChargeLimitReached: false,
    chargedCount: 0,
    chargeableWithinLimit: {},
};

/**
 * Wraps a push call, repairing or dropping items that fail dataset
 * schema-validation instead of letting the whole batch fail. Every dropped
 * item is logged, so existing log-based monitoring keeps working.
 */
async function wrapPushData<T extends object, R>(
    data: T | T[],
    pushFn: (items: T[]) => Promise<R>,
): Promise<R | undefined> {
    const msg = 'Dataset validation failed';
    const { droppedItems, pushResult } = await pushDataWithSchemaRepair(pushFn, data);
    for (const { item, errors } of droppedItems) {
        log.error(msg, { msg, validationErrors: errors, item });
    }
    return pushResult;
}

/**
 * Pushes to the default dataset, or a named dataset when `alias` is given.
 * Items that fail dataset schema-validation are repaired where possible and
 * dropped (with a logged error) otherwise, instead of failing the whole push.
 *
 * @param data - A single item or array of items to push.
 * @param options.alias - Alias of the dataset to push to, opened via {@link Actor.openDataset}.
 *   Omit to push to the default dataset. Does not charge — call {@link Actor.charge}
 *   yourself afterwards if the push should be billable.
 *
 * @example
 * ```ts
 * await safePushData(item);
 * await safePushData(report, { alias: 'competitorAnalysis' });
 * ```
 */
export async function safePushData<T extends object>(
    data: T | T[],
    options?: { alias: string; eventName?: never },
): Promise<void>;
/**
 * Pushes to the default dataset and atomically charges for `eventName`, via
 * {@link Actor.pushData}'s built-in pay-per-event support. Items that fail
 * dataset schema-validation are repaired where possible and dropped (with a
 * logged error) otherwise, instead of failing the whole push.
 *
 * @param data - A single item or array of items to push.
 * @param options.eventName - Pay-per-event event name to charge for this push.
 * @returns The {@link ChargeResult}, e.g. to check `chargeableWithinLimit` and decide whether to keep scraping.
 *
 * @example
 * ```ts
 * const { chargeableWithinLimit } = await safePushData(item, { eventName: 'result-scraped' });
 * ```
 */
export async function safePushData<T extends object>(
    data: T | T[],
    options: { eventName: string; alias?: never },
): Promise<ChargeResult>;
export async function safePushData<T extends object>(
    data: T | T[],
    options?: { alias?: string; eventName?: string },
): Promise<ChargeResult | void> {
    const { alias, eventName } = options ?? {};

    // Default dataset: Actor.pushData(items, eventName) already pushes and
    // charges atomically, so delegate to it as-is instead of reimplementing charging.
    if (!alias) {
        if (eventName) {
            const pushResult = await wrapPushData(data, async (items) => Actor.pushData(items, eventName));
            return pushResult ?? NO_CHARGE_RESULT;
        }
        return wrapPushData(data, async (items) => Actor.pushData(items));
    }

    // Named dataset: charging is handled by the caller — call Actor.charge() themselves after this push.
    const dataset = await Actor.openDataset<T>({ alias });
    return wrapPushData(data, async (items) => dataset.pushData(items));
}
