import { NextResponse } from "next/server";
import { DEVICE_COOKIE, getRequestIdentity } from "../../../lib/security";
import {
  checkAndIncrementGenerationLimit,
  estimateClaudeCost,
  logGeneration,
} from "../../../lib/usage";

type Profile = {
  name: string;
  role?: string;
  email?: string;
  location?: string;
  cv: string;
};

type JobDetails = {
  title?: string;
  company?: string;
  description: string;
};

type GenerateRequest = {
  profile?: Profile;
  job?: JobDetails;
};

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateRequest;
  const identity = await getRequestIdentity();

  if (!body.profile?.name || !body.profile.cv || !body.job?.description) {
    const response = NextResponse.json(
      { error: "Profile name, master CV, and job description are required." },
      { status: 400 },
    );
    setDeviceCookie(response, identity.deviceId);
    return response;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    const response = NextResponse.json(
      { error: "Missing ANTHROPIC_API_KEY. Add it to .env.local and restart the dev server." },
      { status: 500 },
    );
    setDeviceCookie(response, identity.deviceId);
    return response;
  }

  const limit = await checkAndIncrementGenerationLimit(identity);

  if (!limit.allowed) {
    const response = NextResponse.json(
      {
        error: `Generation limit reached. You can generate ${limit.limit} application packs per 24 hours. Try again after ${limit.resetAt.toLocaleString()}.`,
        rateLimit: limit,
      },
      { status: 429 },
    );
    setDeviceCookie(response, identity.deviceId);
    return response;
  }

  const prompt = buildPrompt(body.profile, body.job);

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!anthropicResponse.ok) {
    const error = (await anthropicResponse.json()) as {
      error?: { message?: string };
    };

    const response = NextResponse.json(
      { error: error.error?.message || "Anthropic request failed." },
      { status: anthropicResponse.status },
    );
    setDeviceCookie(response, identity.deviceId);
    return response;
  }

  const data = (await anthropicResponse.json()) as {
    content?: Array<{ text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  const text = data.content?.map((block) => block.text || "").join("") || "";
  const parsed = parseGeneratedText(text);
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  const estimatedCostUsd = estimateClaudeCost(inputTokens, outputTokens);

  await logGeneration({
    deviceHash: identity.deviceHash,
    ipHash: identity.ipHash,
    userAgentHash: identity.userAgentHash,
    userAgent: identity.userAgent,
    profileName: body.profile.name,
    jobTitle: body.job.title || "Not provided",
    company: body.job.company || "Not provided",
    score: parsed.analysis.score,
    model: MODEL,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
  });

  const response = NextResponse.json({
    ...parsed,
    rateLimit: {
      limit: limit.limit,
      remaining: limit.remaining,
      resetAt: limit.resetAt,
    },
  });
  setDeviceCookie(response, identity.deviceId);
  return response;
}

function setDeviceCookie(response: NextResponse, deviceId: string) {
  response.cookies.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}

function buildPrompt(profile: Profile, job: JobDetails) {
  return `You are an expert CV writer and career coach.

Create a tailored application pack using only truthful information from the candidate's master CV. Do not invent employers, degrees, metrics, tools, dates, or responsibilities.

CANDIDATE PROFILE
Name: ${profile.name}
Email: ${profile.email || "Not provided"}
Location: ${profile.location || "Not provided"}
Current or target role: ${profile.role || "Not provided"}

MASTER CV
${profile.cv}

TARGET ROLE
Title: ${job.title || "Not provided"}
Company: ${job.company || "Not provided"}
Job description:
${job.description}

TASK
1. Extract the most important requirements, keywords, and selection criteria from the job description.
2. Select the candidate's most relevant experience, achievements, projects, education, and skills.
3. Write a concise one-page CV tailored to this role. Use clear sections: Contact, Professional Summary, Selected Experience, Skills, Education. Keep it specific and skimmable.
4. Write a warm, specific cover letter in 3-4 short paragraphs.
5. Provide a match analysis with a percentage score, 3 strengths, and 1-2 honest gaps.

STYLE RULES
- Return plain text only.
- Do not use markdown styling.
- Do not use asterisks for bold or bullets.
- Use clean section headings on their own line, e.g. PROFESSIONAL SUMMARY.
- Use simple hyphen bullets for achievement lines where helpful.

Return exactly this format and nothing else:
---CV_START---
[tailored CV]
---CV_END---
---COVER_START---
[cover letter]
---COVER_END---
---ANALYSIS_START---
MATCH_SCORE: [number only]
STRENGTHS: [strength 1] | [strength 2] | [strength 3]
GAPS: [gap 1] | [gap 2]
---ANALYSIS_END---`;
}

function parseGeneratedText(text: string) {
  const cv = sanitizeGeneratedDocument(matchSection(text, "CV") || text.trim());
  const coverLetter = sanitizeGeneratedDocument(matchSection(text, "COVER") || "");
  const analysisText = matchSection(text, "ANALYSIS") || "";
  const scoreMatch = analysisText.match(/MATCH_SCORE:\s*(\d+)/i);
  const strengthsMatch = analysisText.match(/STRENGTHS:\s*(.+)/i);
  const gapsMatch = analysisText.match(/GAPS:\s*(.+)/i);
  const score = scoreMatch ? Number(scoreMatch[1]) : 70;

  return {
    cv,
    coverLetter,
    analysis: {
      score: Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 70,
      strengths: splitList(strengthsMatch?.[1]).map(sanitizeInlineText).slice(0, 3),
      gaps: splitList(gapsMatch?.[1]).map(sanitizeInlineText).slice(0, 2),
    },
  };
}

function matchSection(text: string, section: "CV" | "COVER" | "ANALYSIS") {
  const regex = new RegExp(`---${section}_START---([\\s\\S]*?)---${section}_END---`, "i");
  return text.match(regex)?.[1]?.trim();
}

function splitList(value = "") {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeGeneratedDocument(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      sanitizeInlineText(line)
        .replace(/^#{1,6}\s+/, "")
        .replace(/^\s*[*]\s+/, "- ")
        .trimEnd(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeInlineText(value = "") {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+\*/g, " ")
    .replace(/\*+\s*/g, "")
    .trim();
}
