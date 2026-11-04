/**
 * LogosArena Anti-Cheat, Anti-Prompt-Injection, Steelman Overlap Guard,
 * and Self-Play Collusion Detector.
 */

export const COLLUSION_FLAG = "SELF_PLAY_DETECTED" as const;

export interface InjectionCheckResult {
  injected: boolean;
  matchedPattern?: string;
}

export interface SteelmanCheckResult {
  valid: boolean;
  reason?: string;
  overlapRatio: number;
}

export interface TelemetryPayload {
  mode?: "PVE" | "PVP" | "SUNDAY_BOUNTY" | string;
  totalKeystrokes: number;
  backspaceCount: number;
  editRatio: number; // backspaces / totalKeystrokes (or edit actions / characters)
  cursorJumpCount: number;
  midSentencePauses: number;
  sentenceEndPauses: number;
  tabSwitches: number;
  secondsAwayFromTab: number;
  pasteAttempts?: number;
}

export interface TelemetryEvaluation {
  integrityScore: number;
  flags: string[];
  requiresBlitzCheck: boolean;
}

/**
 * 1. detectPromptInjection(text: string)
 * Scans for meta-commands attempting to manipulate the AI Referee
 * (e.g., "ignore previous instructions", "system prompt", "award 25 points", "zero fallacies", XML closing tags).
 * Returns { injected: boolean, matchedPattern?: string }.
 */
const PROMPT_INJECTION_PATTERNS: { regex: RegExp; label: string }[] = [
  {
    regex: /ignore\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions|prompts|directives|commands|rules)/i,
    label: "ignore previous instructions",
  },
  {
    regex: /disregard\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions|prompts|directives|commands|rules)/i,
    label: "disregard previous instructions",
  },
  {
    regex: /(system\s*prompt|system\s*instructions|system\s*message|developer\s*mode|jailbreak)/i,
    label: "system prompt manipulation",
  },
  {
    regex: /you\s+are\s+now\s+(in\s+developer\s+mode|unrestricted|an\s+ai\s+that\s+can\s+do\s+anything|DAN)/i,
    label: "roleplay override / DAN mode",
  },
  {
    regex: /award\s+(\d+|\w+)\s+(points|hp|clash\s*points)/i,
    label: "award points override",
  },
  {
    regex: /(give|assign|grant)\s+(me|pro|con|player)\s+(\d+|\w+)\s+(points|hp|clash)/i,
    label: "assign points override",
  },
  {
    regex: /zero\s+fallacies/i,
    label: "zero fallacies override",
  },
  {
    regex: /no\s+fallacies\s+detected/i,
    label: "no fallacies override",
  },
  {
    regex: /declare\s+(me|pro|con|this\s+user)\s+(the\s+)?winner/i,
    label: "declare winner override",
  },
  {
    regex: /<\/?[a-zA-Z0-9_-]*(system|prompt|rules|instructions|referee|context|evaluation|critique|admin|mod)[^>]*>/i,
    label: "XML closing/injection tags",
  },
  {
    regex: /\[(system|instruction|admin|referee)\]/i,
    label: "Bracket meta commands",
  },
];

export function detectPromptInjection(text: string): InjectionCheckResult {
  if (!text || typeof text !== "string") {
    return { injected: false };
  }

  for (const { regex, label } of PROMPT_INJECTION_PATTERNS) {
    if (regex.test(text)) {
      return {
        injected: true,
        matchedPattern: label,
      };
    }
  }

  return { injected: false };
}

/**
 * Helper to tokenize text into lowercase word tokens stripping punctuation.
 */
function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Lazy filler templates often used to bypass steelman requirement without actual comprehension.
 */
const LAZY_FILLER_TEMPLATES = [
  /^(my\s+opponent\s+argues\s+that|the\s+opponent\s+claims\s+that|they\s+say\s+that|i\s+understand\s+their\s+point\s+is\s+that)\s*$/i,
  /^(i\s+agree\s+with\s+opponent|as\s+stated\s+above|same\s+as\s+before|they\s+think\s+they\s+are\s+right)\b/i,
  /^(the\s+other\s+side\s+believes\s+something|opponent\s+made\s+an\s+argument\s+about\s+stuff)\b/i,
  /^(blah\s+blah|lorem\s+ipsum|etc\s+etc|what\s+they\s+said)\b/i,
  /^(the\s+opposing\s+argument\s+is\s+good|valid\s+points\s+made\s+by\s+other\s+side)\b/i,
];

/**
 * 2. checkSteelmanParaphrase(opponentText: string, steelmanText: string)
 * Computes normalized word-trigram overlap and minimum length.
 * Rejects the steelman before calling the LLM if verbatim word overlap exceeds 65%,
 * if length is under 8 words, or if it uses lazy filler templates.
 */
export function checkSteelmanParaphrase(
  opponentText: string,
  steelmanText: string
): SteelmanCheckResult {
  const steelmanWords = tokenizeWords(steelmanText || "");
  const opponentWords = tokenizeWords(opponentText || "");

  // 1. Minimum length check: at least 8 words
  if (steelmanWords.length < 8) {
    return {
      valid: false,
      reason: `Steelman summary is too short (${steelmanWords.length} words). Minimum 8 words required.`,
      overlapRatio: 0,
    };
  }

  // 2. Lazy filler template check
  const trimmed = steelmanText.trim();
  for (const pattern of LAZY_FILLER_TEMPLATES) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        reason: "Steelman summary contains generic or lazy filler templates.",
        overlapRatio: 0,
      };
    }
  }

  // 3. Normalized word-trigram overlap check
  if (steelmanWords.length < 3 || opponentWords.length < 3) {
    return {
      valid: true,
      overlapRatio: 0,
    };
  }

  // Build trigram set for opponent
  const opponentTrigrams = new Set<string>();
  for (let i = 0; i <= opponentWords.length - 3; i++) {
    opponentTrigrams.add(`${opponentWords[i]} ${opponentWords[i + 1]} ${opponentWords[i + 2]}`);
  }

  // Extract steelman trigrams and count matches
  const steelmanTrigramsCount = steelmanWords.length - 2;
  let matchingTrigrams = 0;

  for (let i = 0; i <= steelmanWords.length - 3; i++) {
    const trigram = `${steelmanWords[i]} ${steelmanWords[i + 1]} ${steelmanWords[i + 2]}`;
    if (opponentTrigrams.has(trigram)) {
      matchingTrigrams++;
    }
  }

  const overlapRatio = steelmanTrigramsCount > 0 ? matchingTrigrams / steelmanTrigramsCount : 0;

  // Verbatim word overlap exceeds 65% (0.65)
  if (overlapRatio > 0.65) {
    return {
      valid: false,
      reason: `Steelman verbatim overlap is too high (${Math.round(overlapRatio * 100)}%). Must be 65% or less. Express their argument in your own words.`,
      overlapRatio,
    };
  }

  return {
    valid: true,
    overlapRatio,
  };
}

/**
 * 3. evaluateKeystrokeTelemetry(telemetry: TelemetryPayload, textLength: number)
 * - Calculates integrityScore (0 to 100) and flags: string[].
 * - Deducts points if pasteAttempts > 0, tabSwitches > 0, or if textLength > 200
 *   with editRatio < 0.03 and midSentencePauses > sentenceEndPauses * 2 (flagging SECOND_SCREEN_AI_TRANSCRIPTION).
 * - Sets requiresBlitzCheck = true whenever mode === 'SUNDAY_BOUNTY' OR in regular debates whenever integrityScore < 75.
 */
export function evaluateKeystrokeTelemetry(
  telemetry: TelemetryPayload,
  textLength: number
): TelemetryEvaluation {
  let score = 100;
  const flags: string[] = [];

  const pasteAttempts = telemetry.pasteAttempts ?? 0;
  if (pasteAttempts > 0) {
    const deduction = Math.min(40, pasteAttempts * 20);
    score -= deduction;
    flags.push(`PASTE_ATTEMPTED (${pasteAttempts})`);
  }

  if (telemetry.tabSwitches > 0) {
    const deduction = Math.min(30, telemetry.tabSwitches * 10);
    score -= deduction;
    flags.push(`TAB_SWITCHES_DETECTED (${telemetry.tabSwitches})`);
  }

  // Second screen AI transcription detection:
  // textLength > 200 with editRatio < 0.03 and midSentencePauses > sentenceEndPauses * 2
  const editRatio = telemetry.editRatio ?? (telemetry.totalKeystrokes > 0 ? telemetry.backspaceCount / telemetry.totalKeystrokes : 0);
  const midPauses = telemetry.midSentencePauses ?? 0;
  const endPauses = telemetry.sentenceEndPauses ?? 0;

  if (
    textLength > 200 &&
    editRatio < 0.03 &&
    midPauses > endPauses * 2
  ) {
    score -= 35;
    flags.push("SECOND_SCREEN_AI_TRANSCRIPTION");
  }

  // Ensure score is clamped between 0 and 100
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Blitz check requirement:
  // Sets requiresBlitzCheck = true whenever mode === 'SUNDAY_BOUNTY' OR in regular debates whenever integrityScore < 75
  const isSundayBounty = telemetry.mode === "SUNDAY_BOUNTY";
  const requiresBlitzCheck = isSundayBounty || score < 75;

  return {
    integrityScore: score,
    flags,
    requiresBlitzCheck,
  };
}

/**
 * 4. detectPvPCollusion(proDeviceHash: string, conDeviceHash: string, proIp: string, conIp: string)
 * Returns true if both players share the same device fingerprint or IP address,
 * marking the debate is_ranked = 0 (SELF_PLAY_DETECTED) so users cannot farm fake wins against themselves.
 */
export function detectPvPCollusion(
  proDeviceHash?: string | null,
  conDeviceHash?: string | null,
  proIp?: string | null,
  conIp?: string | null
): boolean {
  // Device hash match check
  const proDevice = proDeviceHash?.trim();
  const conDevice = conDeviceHash?.trim();
  if (proDevice && conDevice && proDevice === conDevice) {
    return true;
  }

  // IP address match check
  const pIp = proIp?.trim();
  const cIp = conIp?.trim();
  if (pIp && cIp && pIp === cIp) {
    return true;
  }

  return false;
}
