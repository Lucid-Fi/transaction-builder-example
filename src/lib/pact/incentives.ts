import "server-only";
import { z } from "zod";
import { call, pactUrl, userAuth } from "../http";

// Whole tokens; earned = claimed + claimable + locked.
const RewardAmounts = z.object({ earned: z.string(), claimed: z.string(), claimable: z.string(), locked: z.string() });
export type RewardAmounts = z.infer<typeof RewardAmounts>;
const CampaignStatus = z.enum(["pending", "active", "resolving", "canceled", "complete"]);
export type CampaignStatus = z.infer<typeof CampaignStatus>;
const EntityStatus = z.enum(["ineligible", "eligible", "active", "completed"]);
export type EntityStatus = z.infer<typeof EntityStatus>;

const Campaign = z.object({
  campaign_id: z.string(),
  name: z.string(),
  description: z.string(),
  status: CampaignStatus,
  token: z.object({ address: z.string(), chain: z.string(), symbol: z.string(), decimals: z.number() }),
  starts_on: z.number(), // microseconds
  ends_on: z.number(), // microseconds
});
export type Campaign = z.infer<typeof Campaign>;

const CampaignPage = z.object({ data: z.array(Campaign), cursor: z.string().nullable() });
export type CampaignPage = z.infer<typeof CampaignPage>;

/** The campaign plus this entity's status and rewards; synthesised as `eligible` with zero rewards when not enrolled. */
const EntityCampaign = Campaign.extend({
  attempt: z.number(),
  rewards: RewardAmounts,
  is_accruing: z.boolean(),
  entity_status: EntityStatus,
});
export type EntityCampaign = z.infer<typeof EntityCampaign>;

export async function listCampaigns(token: string): Promise<CampaignPage> {
  // incentives: GET /incentives/campaigns
  return call({
    label: "List incentive campaigns",
    service: "incentives",
    method: "GET",
    url: pactUrl("/incentives/campaigns"),
    headers: userAuth(token),
    schema: CampaignPage,
  });
}

export async function getEntityCampaign(
  token: string,
  entityId: string,
  campaignId: string,
): Promise<EntityCampaign> {
  // incentives: GET /incentives/entities/{entityId}/campaigns/{campaignId}
  return call({
    label: "Get entity campaign",
    service: "incentives",
    method: "GET",
    url: pactUrl(
      `/incentives/entities/${encodeURIComponent(entityId)}/campaigns/${encodeURIComponent(campaignId)}`,
    ),
    headers: userAuth(token),
    schema: EntityCampaign,
  });
}
