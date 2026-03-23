export interface Plan {
  id: string;
  label: string;
  tokens: number;
  stars: number;
  popular: boolean;
  /** Full price in RUB (Stars × ~1.5 RUB/Star, Telegram's approximate rate) */
  priceRub: number;
  /** Margin in RUB after AI API costs — used for MLM PV & bonus calculations */
  marginRub: number;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    label: "Starter",
    tokens: 10,
    stars: 50,
    popular: false,
    priceRub: 75,
    marginRub: 30,
  },
  {
    id: "basic",
    label: "Basic",
    tokens: 50,
    stars: 200,
    popular: false,
    priceRub: 300,
    marginRub: 120,
  },
  {
    id: "pro",
    label: "Pro",
    tokens: 150,
    stars: 500,
    popular: true,
    priceRub: 750,
    marginRub: 300,
  },
  {
    id: "business",
    label: "Business",
    tokens: 400,
    stars: 1200,
    popular: false,
    priceRub: 1800,
    marginRub: 720,
  },
  {
    id: "enterprise",
    label: "Enterprise",
    tokens: 1000,
    stars: 2500,
    popular: false,
    priceRub: 3750,
    marginRub: 1500,
  },
];
