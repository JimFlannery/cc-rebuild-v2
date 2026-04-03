export interface Lesson {
  number: number;
  slug: string;
  title: string;
  blurb: string;
  description: string;   // longer text shown on the lesson sub-page
  duration: string | null;
  video: { type: "youtube"; id: string } | { type: "upload"; file: string } | null;
}

export const LESSONS: Lesson[] = [
  {
    number: 1,
    slug: "intro-to-conditioncover",
    title: "Intro to ConditionCover",
    blurb: "Discover how ConditionCover works: what problem it solves, who it's for, and how space weather risk is transferred between parties through smart contracts.",
    description:
      "ConditionCover is a space-weather risk-hedging platform built on Solana. In this lesson you'll learn what problem it solves, who the Hedge and Cover parties are, and how parametric smart contracts transfer risk automatically when a space weather index crosses a threshold — with no claims process required.",
    duration: null,
    video: null,
  },
  {
    number: 2,
    slug: "what-is-space-weather",
    title: "What is Space Weather?",
    blurb: "Explore the science behind geomagnetic storms, solar flares, and the indices that measure them — and why disruptions to satellites, power grids, and space commerce are a real financial risk.",
    description:
      "Space weather refers to environmental conditions in near-Earth space driven by solar activity. Geomagnetic storms, solar flares, and radiation events can damage satellites, disrupt GPS, knock out power grids, and interrupt radio communications. This lesson covers the key indices — Kp, Dst, and others — that scientists use to measure storm intensity, and explains why these events represent a growing and quantifiable financial risk for businesses and infrastructure operators worldwide.",
    duration: "~5 min",
    video: { type: "youtube", id: "HrloxznL93s" },
  },
  {
    number: 3,
    slug: "how-to-create-a-hedge-order",
    title: "How to Create a Hedge Order",
    blurb: "A step-by-step walkthrough of placing a Hedge order: selecting your index, threshold, coverage amount, and duration to secure protection against a space weather event.",
    description:
      "In this lesson you'll follow the full Hedge order flow: choosing a space weather index, selecting the payout threshold that matches your risk exposure, entering your desired coverage amount, and setting the contract duration. You'll also see how the probability-based premium is calculated and what happens to your funds once the order is matched by a Cover party.",
    duration: null,
    video: null,
  },
  {
    number: 4,
    slug: "how-to-match-a-hedge-order",
    title: "How to Match a Hedge Order",
    blurb: "Learn how Cover parties browse the marketplace, evaluate Hedge orders, and match to earn hedge premiums and SSTM token rewards in exchange for providing coverage.",
    description:
      "Cover parties are the liquidity providers of the ConditionCover marketplace. This lesson walks through browsing open Hedge orders, evaluating payout probability versus premium yield, and matching an order to deploy your SSTM as coverage. You'll see how premiums are paid to your wallet at match time and how SSTM token rewards accrue over the life of the contract.",
    duration: null,
    video: null,
  },
  {
    number: 5,
    slug: "risk-sharing",
    title: "Risk Sharing & Network Effects",
    blurb: "See how the Risk Sharing system benefits both sides of a contract — lowering premiums for Hedge parties and amplifying APY for Cover parties of all sizes through network effects.",
    description:
      "Risk Sharing is a multi-order mechanism that pools coverage across many Cover parties for a single Hedge order, and vice versa. For Hedge parties this reduces the premium cost; for Cover parties it smooths out individual exposure and increases effective APY through network effects. This lesson explains how the matching algorithm works and why larger participation makes the platform better for everyone.",
    duration: null,
    video: null,
  },
  {
    number: 6,
    slug: "risk-management",
    title: "Risk Management & Delta Neutral Strategies",
    blurb: "Understand how to reduce or eliminate cover loss risk by pairing an offsetting contract — achieving a delta neutral position where your net exposure is zero regardless of outcome.",
    description:
      "Advanced Cover parties can eliminate directional risk entirely by creating an offsetting contract that pays out if the same event occurs. This delta neutral position means you collect premiums and rewards on both sides with no net loss regardless of whether the event occurs. This lesson covers how to identify, size, and place offsetting contracts — and introduces the Yield Boost feature that automates this strategy with leverage.",
    duration: null,
    video: null,
  },
];

export function getLessonBySlug(slug: string): Lesson | undefined {
  return LESSONS.find((l) => l.slug === slug);
}
