/**
 * Strict TypeScript types for LogosArena AI Referee, Fallacy Taxonomy,
 * Citation Verification, Steelman Evaluation, Blitz Interrogation,
 * and Persona Definitions.
 */

// 1. Fallacy Taxonomy: 10 logical fallacies + RTM (Referee Tampering / Meta-Gaming)
export type FallacyCode =
  | "SM" // Straw Man
  | "Eq" // Equivocation
  | "AH" // Ad Hominem
  | "FC" // False Cause
  | "RH" // Red Herring
  | "HG" // Hasty Generalization
  | "SS" // Slippery Slope
  | "FD" // False Dilemma
  | "AA" // Appeal to Authority
  | "CR"; // Circular Reasoning

export type RefereePenaltyCode = FallacyCode | "RTM";

export interface FallacyDefinition {
  code: RefereePenaltyCode;
  name: string;
  defaultHpPenalty: number;
  description: string;
}

export const FALLACY_TAXONOMY: Record<RefereePenaltyCode, FallacyDefinition> = {
  SM: {
    code: "SM",
    name: "Straw Man",
    defaultHpPenalty: 15,
    description: "Misrepresenting or exaggerating an opponent's argument to make it easier to attack.",
  },
  Eq: {
    code: "Eq",
    name: "Equivocation",
    defaultHpPenalty: 12,
    description: "Using an ambiguous term in more than one sense, making the argument misleading.",
  },
  AH: {
    code: "AH",
    name: "Ad Hominem",
    defaultHpPenalty: 15,
    description: "Attacking the opponent's character or motives rather than addressing the substance of their argument.",
  },
  FC: {
    code: "FC",
    name: "False Cause",
    defaultHpPenalty: 10,
    description: "Presuming that a real or perceived relationship between things means that one is the cause of the other.",
  },
  RH: {
    code: "RH",
    name: "Red Herring",
    defaultHpPenalty: 12,
    description: "Introducing an irrelevant topic to divert attention from the primary issue.",
  },
  HG: {
    code: "HG",
    name: "Hasty Generalization",
    defaultHpPenalty: 10,
    description: "Drawing a broad conclusion based on insufficient or unrepresentative evidence.",
  },
  SS: {
    code: "SS",
    name: "Slippery Slope",
    defaultHpPenalty: 12,
    description: "Asserting that a relatively small first step inevitably leads to a chain of negative events without proof.",
  },
  FD: {
    code: "FD",
    name: "False Dilemma",
    defaultHpPenalty: 12,
    description: "Presenting two alternative states as the only possibilities when more possibilities exist.",
  },
  AA: {
    code: "AA",
    name: "Appeal to Authority",
    defaultHpPenalty: 10,
    description: "Using an authority's opinion as absolute proof instead of presenting sound logical reasons or evidence.",
  },
  CR: {
    code: "CR",
    name: "Circular Reasoning",
    defaultHpPenalty: 15,
    description: "A proposition is supported by a premise that is essentially equivalent to the conclusion itself.",
  },
  RTM: {
    code: "RTM",
    name: "Referee Tampering / Meta-Gaming",
    defaultHpPenalty: 25,
    description: "Attempting prompt injection, role-play bypass, system override, or manipulating debate scoring/referee mechanics.",
  },
};

// 2. Citation Verification Types
export type CitationVerdict = "VERIFIED" | "OUT_OF_CONTEXT" | "FABRICATED";

export const CITATION_REWARDS_PENALTIES = {
  VERIFIED: { hpDelta: 0, clashDelta: 10 },
  OUT_OF_CONTEXT: { hpDelta: -10, clashDelta: 0 },
  FABRICATED: { hpDelta: -20, clashDelta: 0 },
} as const;

export interface CitationCheck {
  source: string;
  quoteOrClaim: string;
  verdict: CitationVerdict;
  explanation: string;
  hpDelta: number;
  clashDelta: number;
}

// 3. Fallacy Detection Item
export interface FallacyDetection {
  code: RefereePenaltyCode;
  name: string;
  quote: string;
  explanation: string;
  hpPenalty: number;
}

// 4. Steelman Evaluation
export interface SteelmanEvaluation {
  valid: boolean;
  score: number; // 0 to 100
  feedback: string;
  reason?: string;
  trigramOverlapRatio?: number;
}

// 5. Referee Turn Evaluation
export interface RefereeTurnEvaluation {
  fallacies: FallacyDetection[];
  citations: CitationCheck[];
  clashScore: number; // 0 to 25
  droppedPremises: string[];
  hpDeducted: number; // Positive number representing total damage taken (e.g. 25)
  clashAwarded: number; // Positive points earned towards clash
  refereeCommentary: string;
  tamperingDetected?: boolean;
}

// 6. 25-Second Blitz Cross-Examination
export interface BlitzQuestionResult {
  question: string;
  targetedPremise: string;
}

export interface BlitzVerificationResult {
  passed: boolean;
  reason: string;
  hpPenalty: number;
}

// 7. Persona Types
export type PersonaId =
  | "aquinas"
  | "ghazali"
  | "nietzsche_materialist"
  | "ubuntu_sage"
  | "stoic_logician"
  | "sunday_grandmaster";

export interface PersonaDefinition {
  id: PersonaId;
  name: string;
  title: string;
  schoolOfThought: string;
  avatarUrl?: string;
  methodology: string;
  coreTenets: string[];
  tonePrompt: string;
  sampleOpening: string;
}

// 8. Final Autopsy
export interface AutopsyRoundDetail {
  roundNumber: number;
  proSummary: string;
  conSummary: string;
  keyClash: string;
  fallaciesCommitted: { side: "PRO" | "CON"; code: RefereePenaltyCode; name: string }[];
}

export interface FinalAutopsy {
  winner: "PRO" | "CON" | "DRAW";
  decisiveBlow: string;
  proStrengths: string[];
  proWeaknesses: string[];
  conStrengths: string[];
  conWeaknesses: string[];
  roundBreakdown: AutopsyRoundDetail[];
  finalSynthesis: string;
}
