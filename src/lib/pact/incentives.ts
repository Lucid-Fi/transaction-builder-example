import "server-only";
import { call, pactUrl, userAuth } from "../http";

// Whole tokens; earned = claimed + claimable + locked.
export type RewardAmounts = { earned: string; claimed: string; claimable: string; locked: string };
export type CampaignStatus = "pending" | "active" | "resolving" | "canceled" | "complete";
export type EntityStatus = "ineligible" | "eligible" | "active" | "completed";

export type Campaign = {
  campaign_id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  token: { address: string; chain: string; symbol: string; decimals: number };
  starts_on: number; // microseconds
  ends_on: number; // microseconds
};

export type CampaignPage = { data: Campaign[]; cursor: string | null };

/** The campaign plus this entity's status and rewards; synthesised as `eligible` with zero rewards when not enrolled. */
export type EntityCampaign = Campaign & {
  attempt: number;
  rewards: RewardAmounts;
  is_accruing: boolean;
  entity_status: EntityStatus;
};

export async function listCampaigns(token: string): Promise<CampaignPage> {
  // incentives: GET /incentives/campaigns
  return call<CampaignPage>({
    label: "List incentive campaigns",
    service: "incentives",
    method: "GET",
    url: pactUrl("/incentives/campaigns"),
    headers: userAuth(token),
  });
}

export async function getEntityCampaign(
  token: string,
  entityId: string,
  campaignId: string,
): Promise<EntityCampaign> {
  // incentives: GET /incentives/entities/{entityId}/campaigns/{campaignId}
  return call<EntityCampaign>({
    label: "Get entity campaign",
    service: "incentives",
    method: "GET",
    url: pactUrl(
      `/incentives/entities/${encodeURIComponent(entityId)}/campaigns/${encodeURIComponent(campaignId)}`,
    ),
    headers: userAuth(token),
  });
}
