import { sql, gte, desc, count } from "drizzle-orm";

import { db } from "@/db/client";
import { contacts, leads, orders } from "@/db/schema";

// Port of SocialCRM `src/lib/analytics/queries.ts` (H-05) + the AH funnel
// query (lead → contact → order). Read-only aggregates over `leads`; every
// query degrades to zeros/empty when the table has no data yet.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SummaryStats {
  totalLeads: number;
  leadsThisWeek: number;
  topCampaign: string | null;
  conversionRate: number;
}

export interface DailyLeads {
  date: string; // YYYY-MM-DD
  count: number;
  source: string | null;
}

export interface CampaignPerformance {
  campaign: string;
  leadCount: number;
  convertedCount: number;
  rate: number;
}

export interface ChannelBreakdown {
  channel: string;
  leadCount: number;
  convertedCount: number;
}

export interface FunnelStats {
  leads: number;
  leadsWithContact: number;
  contacts: number;
  ordersFromLeadContacts: number;
  orders: number;
}

// ─── getSummaryStats ──────────────────────────────────────────────────────────

/**
 * Returns aggregate stats:
 * - totalLeads: all-time count
 * - leadsThisWeek: leads created in the last 7 days
 * - topCampaign: utm_campaign with the most leads (null if no campaign data)
 * - conversionRate: fraction of leads with status "convertido" (0–1)
 */
export async function getSummaryStats(): Promise<SummaryStats> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [totals] = await db
    .select({
      totalLeads: count(),
      convertedCount: sql<number>`cast(sum(case when ${leads.status} = 'convertido' then 1 else 0 end) as int)`,
    })
    .from(leads);

  const [weekRow] = await db
    .select({ leadsThisWeek: count() })
    .from(leads)
    .where(gte(leads.createdAt, oneWeekAgo));

  const topCampaignRows = await db
    .select({
      campaign: leads.utmCampaign,
      leadCount: count(),
    })
    .from(leads)
    .where(sql`${leads.utmCampaign} is not null`)
    .groupBy(leads.utmCampaign)
    .orderBy(desc(count()))
    .limit(1);

  const total = totals?.totalLeads ?? 0;
  const converted = totals?.convertedCount ?? 0;
  const thisWeek = weekRow?.leadsThisWeek ?? 0;
  const topCampaign = topCampaignRows[0]?.campaign ?? null;

  return {
    totalLeads: total,
    leadsThisWeek: thisWeek,
    topCampaign,
    conversionRate: total > 0 ? converted / total : 0,
  };
}

// ─── getLeadsByDay ────────────────────────────────────────────────────────────

/**
 * Returns lead counts per day for the last `days` days, grouped by utm_source.
 * Each row is { date: "YYYY-MM-DD", count, source }.
 */
export async function getLeadsByDay(days: number): Promise<DailyLeads[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      date: sql<string>`to_char(${leads.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`cast(count(*) as int)`,
      source: leads.utmSource,
    })
    .from(leads)
    .where(gte(leads.createdAt, since))
    .groupBy(sql`to_char(${leads.createdAt}, 'YYYY-MM-DD')`, leads.utmSource)
    .orderBy(sql`to_char(${leads.createdAt}, 'YYYY-MM-DD')`);

  return rows.map((r) => ({
    date: r.date,
    count: r.count,
    source: r.source ?? null,
  }));
}

// ─── getCampaignPerformance ───────────────────────────────────────────────────

/**
 * Returns per-campaign stats sorted by leadCount descending.
 * Covers utm_campaign AND decoded ref-code campaignIds (the wa.me ref flow
 * stamps campaign_id, not utm_campaign) — the campaign label shown is
 * coalesce(utm_campaign, campaign_id). rate = convertedCount / leadCount.
 */
export async function getCampaignPerformance(): Promise<CampaignPerformance[]> {
  const campaignLabel = sql`coalesce(${leads.utmCampaign}, ${leads.campaignId})`;
  const rows = await db
    .select({
      campaign: sql<string>`${campaignLabel}`,
      leadCount: sql<number>`cast(count(*) as int)`,
      convertedCount: sql<number>`cast(sum(case when ${leads.status} = 'convertido' then 1 else 0 end) as int)`,
    })
    .from(leads)
    .where(sql`${campaignLabel} is not null`)
    .groupBy(campaignLabel)
    .orderBy(desc(sql`count(*)`));

  return rows.map((r) => {
    const leadCount = r.leadCount ?? 0;
    const convertedCount = r.convertedCount ?? 0;
    return {
      campaign: r.campaign,
      leadCount,
      convertedCount,
      rate: leadCount > 0 ? convertedCount / leadCount : 0,
    };
  });
}

// ─── getChannelBreakdown ─────────────────────────────────────────────────────

/**
 * Leads grouped by acquisition channel: `platform` (meta/organic/whatsapp…)
 * when set, else the inbound `channel` column. Sorted by leadCount desc.
 */
export async function getChannelBreakdown(): Promise<ChannelBreakdown[]> {
  const channelLabel = sql`coalesce(${leads.platform}, ${leads.channel}, 'desconocido')`;
  const rows = await db
    .select({
      channel: sql<string>`${channelLabel}`,
      leadCount: sql<number>`cast(count(*) as int)`,
      convertedCount: sql<number>`cast(sum(case when ${leads.status} = 'convertido' then 1 else 0 end) as int)`,
    })
    .from(leads)
    .groupBy(channelLabel)
    .orderBy(desc(sql`count(*)`));

  return rows.map((r) => ({
    channel: r.channel,
    leadCount: r.leadCount ?? 0,
    convertedCount: r.convertedCount ?? 0,
  }));
}

// ─── getFunnelStats ──────────────────────────────────────────────────────────

/**
 * Funnel lead → contact → order:
 * - leadsWithContact: leads already linked to a contact row (contact_id set
 *   by the inbound capture or manual linking).
 * - ordersFromLeadContacts: orders whose contact_id belongs to a lead —
 *   the measurable bottom of the attribution funnel.
 */
export async function getFunnelStats(): Promise<FunnelStats> {
  const [leadTotals] = await db
    .select({
      leads: count(),
      leadsWithContact: sql<number>`cast(sum(case when ${leads.contactId} is not null then 1 else 0 end) as int)`,
    })
    .from(leads);

  const [contactTotals] = await db.select({ contacts: count() }).from(contacts);

  const [orderTotals] = await db
    .select({
      orders: count(),
      ordersFromLeadContacts: sql<number>`cast(sum(case when ${orders.contactId} in (select ${leads.contactId} from ${leads} where ${leads.contactId} is not null) then 1 else 0 end) as int)`,
    })
    .from(orders);

  return {
    leads: leadTotals?.leads ?? 0,
    leadsWithContact: leadTotals?.leadsWithContact ?? 0,
    contacts: contactTotals?.contacts ?? 0,
    ordersFromLeadContacts: orderTotals?.ordersFromLeadContacts ?? 0,
    orders: orderTotals?.orders ?? 0,
  };
}
