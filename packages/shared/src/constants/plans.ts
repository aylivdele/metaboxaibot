export interface Plan {
  id: string;
  label: string;
  tokens: number;
  stars: number;
  popular: boolean;
}

export const PLANS: Plan[] = [
  { id: "starter", label: "Starter", tokens: 10, stars: 50, popular: false },
  { id: "basic", label: "Basic", tokens: 50, stars: 200, popular: false },
  { id: "pro", label: "Pro", tokens: 150, stars: 500, popular: true },
  { id: "business", label: "Business", tokens: 400, stars: 1200, popular: false },
  { id: "enterprise", label: "Enterprise", tokens: 1000, stars: 2500, popular: false },
];
