/** Suitability for a skill game that takes an entry stake and pays the winner. Not a general shopping use. */

export type Suitability = "explicit" | "conditional" | "prohibited" | "unclear";

export type ProviderPolicy = {
  id: string;
  suitability: Suitability;
  solanaUsdc: boolean;
  cards: boolean;
  sandbox: boolean;
  source: string;
  finding: string;
};

export const PROVIDER_POLICY: readonly ProviderPolicy[] = [
  {
    id: "moonpay",
    suitability: "conditional",
    solanaUsdc: true,
    cards: true,
    sandbox: true,
    source: "https://www.moonpay.com/legal/terms_of_use_usa",
    finding: "US terms require prior written consent before a Cash App payout related to a game of skill with an entry fee or prize, and they prohibit unlawful gambling. A sandbox key is not that consent.",
  },
  {
    id: "coinbase",
    suitability: "conditional",
    solanaUsdc: true,
    cards: true,
    sandbox: true,
    source: "https://www.coinbase.com/legal/prohibited_use",
    finding: "Games of skill that are not defined as gambling but require an entry fee and award a prize need express written consent before using Coinbase services.",
  },
  {
    id: "stripe",
    suitability: "prohibited",
    solanaUsdc: false,
    cards: true,
    sandbox: false,
    source: "https://stripe.com/legal/restricted-businesses",
    finding: "Prohibited businesses include games of skill with a monetary or material prize and payments of an entry fee that promise a prize.",
  },
  {
    id: "transak",
    suitability: "prohibited",
    solanaUsdc: true,
    cards: true,
    sandbox: false,
    source: "https://transak.com/acceptable-use-policy",
    finding: "The acceptable use policy lists gambling as a prohibited use. No written exception exists for this match.",
  },
  {
    id: "ramp-network",
    suitability: "unclear",
    solanaUsdc: true,
    cards: true,
    sandbox: false,
    source: "https://rampnetwork.com/terms-of-service",
    finding: "The terms forbid using the service for gambling, betting, or similar games of chance. They do not approve an entry-fee skill game.",
  },
  {
    id: "banxa",
    suitability: "unclear",
    solanaUsdc: true,
    cards: true,
    sandbox: false,
    source: "https://banxa.com/terms-of-use",
    finding: "Customer terms bar unlawful gambling, including contests and unsanctioned games of chance. They do not approve this stake-and-prize match.",
  },
  {
    id: "paysafe",
    suitability: "conditional",
    solanaUsdc: false,
    cards: true,
    sandbox: false,
    source: "https://igamingfuture.com/sweepstakes-casinos/news/paysafe-just-made-it-easier-to-use-crypto-at-us-casino-sites-heres-what-changed/",
    finding: "The published MoonPay-powered product is for licensed iGaming operators. It is not approval for this unlicensed non-custodial match.",
  },
];

/** Public wagering stays off. An empty list is intentional until a provider approves this use. */
export const PUBLIC_FIAT_WAGERING = false;

export function selectableForSandbox(): ProviderPolicy[] {
  return PROVIDER_POLICY.filter((item) => item.sandbox && item.suitability !== "prohibited");
}

export function prohibitedForWagering(): string[] {
  return PROVIDER_POLICY.filter((item) => item.suitability === "prohibited").map((item) => item.id);
}
