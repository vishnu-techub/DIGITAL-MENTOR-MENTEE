import https from 'https';
import { correctText, type GrammarStatus } from '../grammar/grammar.service.js';
import { preservesProtectedValues } from '../grammar/protected-values.js';
import { localModelGrammarSuggestion } from '../grammar/grammar.context.js';

// Re-exported so existing importers (and tests) keep the same public surface.
export { extractProtectedValues, preservesProtectedValues } from '../grammar/protected-values.js';

/**
 * AI Assistant & Grammar Engine for KSRCE Mentoring Portal
 */

export interface AiBotResponse {
  answer: string;
  topic: string;
  suggestedQuestions?: string[];
  source: 'LLM' | 'INSTITUTIONAL_AI_BOT';
}

export interface GrammarCheckResponse {
  original: string;
  corrected: string;
  hasCorrections: boolean;
  source: 'LLM' | 'INSTITUTIONAL_GRAMMAR_ENGINE';
  /**
   * Machine-readable outcome of the correction. `NO_RELIABLE_CORRECTION` means
   * the text was returned unchanged; `AMBIGUOUS_INPUT` means a plausible
   * correction existed but was deliberately not applied.
   */
  status: GrammarStatus;
}

/**
 * 1. AI Bot for Mentors (Question & Answer + Guidance)
 */
export async function askMentorAiBot(question: string): Promise<AiBotResponse> {
  const qClean = question.trim();
  const qLower = qClean.toLowerCase();

  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim() || 'gemini-1.5-flash';

  // If external LLM key is configured, query LLM first
  if (apiKey) {
    try {
      const llmAnswer = await queryExternalLlmForBot(apiKey, model, qClean);
      if (llmAnswer) {
        return {
          answer: llmAnswer,
          topic: detectTopic(qLower),
          source: 'LLM',
        };
      }
    } catch (err: any) {
      console.warn('External AI call for mentor bot failed, falling back to local engine:', err.message);
    }
  }

  // Institutional Knowledge Engine fallback
  return getInstitutionalBotAnswer(qClean, qLower);
}

function detectTopic(q: string): string {
  if (q.includes('communication') || q.includes('speaking') || q.includes('english')) return 'Communication Skills';
  if (q.includes('presentation') || q.includes('seminar') || q.includes('slide')) return 'Presentation Skills';
  if (q.includes('arrear') || q.includes('fail') || q.includes('exam') || q.includes('academic')) return 'Arrear & Academic Guidance';
  if (q.includes('attendance') || q.includes('absent') || q.includes('bunk') || q.includes('leave')) return 'Attendance & Discipline';
  if (q.includes('meeting') || q.includes('saturday') || q.includes('question')) return 'Meeting Discussion Points';
  if (q.includes('placement') || q.includes('interview') || q.includes('career') || q.includes('resume')) return 'Career & Placement';
  return 'General Mentoring Guidance';
}

/**
 * Institutional AI Knowledge System for Mentor Q&A
 */
function getInstitutionalBotAnswer(question: string, q: string): AiBotResponse {
  const topic = detectTopic(q);

  // 1. Communication skills
  if (q.includes('communication') || q.includes('speaking') || q.includes('english') || q.includes('verbal')) {
    return {
      topic: 'Communication Skills',
      answer: `Recommended Strategies to Improve Mentee Communication Skills:

1. Daily Micro-Habits:
• Encourage 5 minutes of daily reading from technical journals or standard English newspapers (The Hindu, IEEE Spectrum).
• Recommend practicing self-recording on mobile: 2-minute audio summaries of class topics to review fluency and pronunciation.

2. Departmental & Peer Activities:
• Pair the student with a communicative peer buddy for laboratory viva-voce practice.
• Advise participation in English Language Lab software modules available in the KSRCE Central Library.

3. Low-Stress Interactive Steps:
• Start internal mentoring meetings with conversational English on non-academic topics.
• Encourage active question-asking during lecture hours without fear of judgment.

4. Action Plan for Mentee:
• Week 1–2: Read aloud 1 page daily and record 2-minute voice summaries.
• Week 3–4: Speak in English during Saturday mentoring reviews and lab vivas.`,
      suggestedQuestions: [
        'What activities can help improve presentation skills?',
        'Suggest questions to ask during a mentor meeting.',
        'How can I guide a shy student to speak up?',
      ],
      source: 'INSTITUTIONAL_AI_BOT',
    };
  }

  // 2. Presentation skills
  if (q.includes('presentation') || q.includes('seminar') || q.includes('slide') || q.includes('stage fear')) {
    return {
      topic: 'Presentation Skills',
      answer: `Practical Action Plan for Enhancing Mentee Presentation Skills:

1. Structured 3-Tier Rehearsal:
• Step 1 (Solo): Practice presenting slides in front of a mirror or laptop camera.
• Step 2 (Peer Review): Present to mentor or 2 close friends in faculty cabin for constructive feedback.
• Step 3 (Classroom): Present 5-minute technical seminar during departmental symposium or seminar hours.

2. Slide Preparation Guidelines:
• Adhere to 6x6 rule: Maximum 6 bullet points per slide, 6 words per bullet.
• Use high-contrast diagrams and flowcharts instead of heavy text paragraphs.
• Include a clear 'Key Takeaways' concluding slide.

3. Overcoming Stage Anxiety:
• Teach the 4-7-8 breathing exercise before stepping to the podium.
• Focus initial eye contact on the mentor or a supportive peer in the front row.
• Open with a rhetorical question or a real-world engineering problem statement.

4. Suggested Mentoring Follow-Up:
• Assign a 3-slide, 3-minute mini-presentation for the upcoming Saturday meeting.`,
      suggestedQuestions: [
        'How can I improve a student\'s communication skills?',
        'Suggest questions to ask during a mentor meeting.',
      ],
      source: 'INSTITUTIONAL_AI_BOT',
    };
  }

  // 3. Repeated arrears & academic recovery
  if (q.includes('arrear') || q.includes('repeated') || q.includes('backlog') || q.includes('fail')) {
    return {
      topic: 'Arrear & Academic Guidance',
      answer: `Comprehensive Protocol for Guiding Students with Repeated Arrears:

1. Root Cause Identification:
• Academic Gap: Concept weakness vs. exam writing strategy vs. inadequate practice.
• Non-Academic Friction: Commute exhaustion, excessive screen time, family stress, or peer distractions.
• Subject Analysis: Distinguish between mathematical/analytical subjects and theoretical courses.

2. Concrete Academic Recovery Plan:
• Re-exam Timetable: Divide syllabus into 3 priority modules; master 60% of core syllabus thoroughly first.
• Question Bank Strategy: Solve 5 previous semester Anna University / Autonomous question papers step-by-step.
• Weekly Verification: Check solved answer booklets every Saturday mentoring session.

3. Remedial Coaching & Departmental Support:
• Enroll student in evening remedial coaching classes under respective subject handling faculty.
• Form a 2-person study group with a high-performing peer mentee.

4. Psychological & Parental Alignment:
• Reassure student that arrears are temporary and solvable with disciplined revision.
• Update parents transparently and establish dedicated study hours at home/hostel.`,
      suggestedQuestions: [
        'Give me counselling discussion points for poor attendance.',
        'Suggest questions to ask during a mentor meeting.',
      ],
      source: 'INSTITUTIONAL_AI_BOT',
    };
  }

  // 4. Attendance & discipline
  if (q.includes('attendance') || q.includes('absent') || q.includes('bunk') || q.includes('leave') || q.includes('late')) {
    return {
      topic: 'Attendance & Discipline',
      answer: `Counselling Discussion Points & Protocol for Poor Attendance:

1. Key Discussion Points for the Session:
• "Let's review your attendance ledger together: What specific factors cause you to miss classes on Mondays or Fridays?"
• "Are you facing health issues, transportation delays, or staying up late in the hostel/home?"
• "Are there specific subjects you feel reluctant to attend due to difficulties with the syllabus?"

2. Autonomous Regulation Awareness:
• Remind mentee of 75% mandatory attendance requirement for semester exam eligibility.
• Explain consequences: Condonation fine (65%–74%) or Redo / Detention (<65%).

3. Action Items to Agree Upon:
• Weekly Attendance Goal: Achieve 100% attendance for next 14 consecutive working days.
• Daily Check-in: Sign in with mentor or class advisor before 8:45 AM.
• Laboratory Priority: Prioritize 100% lab attendance to avoid expensive makeup sessions.

4. Parent Communication:
• If attendance < 75%, schedule a direct telephonic briefing with parents.`,
      suggestedQuestions: [
        'How should I guide a student with repeated arrears?',
        'Suggest questions to ask during a mentor meeting.',
      ],
      source: 'INSTITUTIONAL_AI_BOT',
    };
  }

  // 5. Mentor meeting questions
  if (q.includes('meeting') || q.includes('question') || q.includes('saturday') || q.includes('ask')) {
    return {
      topic: 'Meeting Discussion Points',
      answer: `High-Impact Questions for Saturday Mentor–Mentee Meetings:

1. Academic Well-being:
• "Which subject are you finding most challenging this semester, and what specific topic gave you difficulty this week?"
• "Have you completed all laboratory observation books and mini-project milestones on schedule?"
• "How are you preparing for the upcoming Continuous Internal Assessment (CIA) test?"

2. Skill Development & Beyond Curriculum:
• "Which online certification course (NPTEL, Coursera, or Infosys Springboard) are you currently pursuing?"
• "Have you worked on any coding problems (LeetCode/HackerRank) or hands-on projects this month?"
• "Are you planning to participate in any inter-college symposium or hackathon this semester?"

3. Personal & Hostel/Day-Scholar Well-being:
• "How are your sleep schedule, food, and daily commute routines working out?"
• "Are you facing any interpersonal difficulties with room-mates or classmates?"
• "What is one goal you want us to accomplish together before our next Saturday meeting?"`,
      suggestedQuestions: [
        'How can I improve a student\'s communication skills?',
        'What activities can help improve presentation skills?',
        'How should I guide a student with repeated arrears?',
      ],
      source: 'INSTITUTIONAL_AI_BOT',
    };
  }

  // General Mentoring Default
  return {
    topic: 'General Mentoring Guidance',
    answer: `Institutional Mentoring Guidelines for: "${question}"

1. Establish Rapport:
• Begin meetings with positive reinforcement of the student's existing strengths before addressing challenges.
• Listen actively for 60% of the conversation; encourage the mentee to articulate their own proposed solutions.

2. Set SMART Milestones:
• Specific: Break overarching goals (e.g., "improve CGPA") into tangible tasks (e.g., "score 35+ in CIA-1 for Maths").
• Measurable: Use weekly attendance percentages and question-bank submissions.
• Action-Oriented: Every session should conclude with 2–3 clear action items.

3. Document & Follow-Up:
• Log key observations and agreed deadlines in the portal.
• Review previous action items at the start of the subsequent Saturday session.`,
    suggestedQuestions: [
      'How can I improve a student\'s communication skills?',
      'What activities can help improve presentation skills?',
      'How should I guide a student with repeated arrears?',
      'Suggest questions to ask during a mentor meeting.',
    ],
    source: 'INSTITUTIONAL_AI_BOT',
  };
}

/**
 * Strip the wrapper an LLM may add around its answer: code fences, surrounding
 * quotes, and a leading label such as "Corrected text:". Only the corrected
 * prose is ever returned, so it can be applied to a textarea as-is.
 */
export function sanitizeLlmOutput(raw: string): string {
  let text = raw.trim();

  // ```...``` fences, with or without a language tag.
  text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();

  // A leading label the model may have prepended.
  text = text.replace(/^(corrected(\s+(text|version|sentence))?|suggestion|output)\s*:\s*/i, '');

  // Matching surrounding quotes.
  if (/^".*"$/.test(text) || /^'.*'$/.test(text)) {
    text = text.slice(1, -1).trim();
  }

  // An LLM that returns prose instead of a correction is not usable; anything
  // containing a newline with a sentence fragment is treated as commentary.
  if (/\n\s*\n/.test(text) && text.split('\n').filter((l) => l.trim()).length > 4) {
    return '';
  }

  return text;
}

/**
 * 2. Auto Spelling + Grammar Correction Engine (Writing Assistance)
 * Strictly preserves mentor's meaning without inventing facts.
 */
export async function correctGrammarAndSpelling(text: string): Promise<GrammarCheckResponse> {
  const original = text || '';
  if (!original.trim()) {
    return {
      original,
      corrected: original,
      hasCorrections: false,
      source: 'INSTITUTIONAL_GRAMMAR_ENGINE',
      status: 'NO_RELIABLE_CORRECTION',
    };
  }

  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim() || 'gemini-1.5-flash';

  if (apiKey && original.length > 8) {
    try {
      const llmCorrected = await callExternalGrammarLlm(apiKey, model, original);
      const candidate = sanitizeLlmOutput(llmCorrected || '');

      if (candidate && candidate.trim() !== original.trim()) {
        // An LLM can ignore the prompt. It cannot make a deleted number survive,
        // so any suggestion that loses or alters an official value is discarded
        // and the deterministic rule engine is used instead.
        if (!preservesProtectedValues(original, candidate)) {
          console.warn('AI suggestion altered an official value; falling back to the rule-based engine.');
        } else {
          return {
            original,
            corrected: candidate.trim(),
            hasCorrections: true,
            source: 'LLM',
            status: 'EXTERNAL_AI',
          };
        }
      }
    } catch (err: any) {
      console.warn('External grammar check failed, applying rule-based engine:', err.message);
    }
  }

  // Optional local language model (Ollama). OFF unless GRAMMAR_LOCAL_MODEL is
  // enabled and a server is reachable; any failure falls through silently.
  const localCandidate = await localModelGrammarSuggestion(original);
  if (localCandidate) {
    const sanitized = sanitizeLlmOutput(localCandidate);
    if (
      sanitized &&
      sanitized.trim() !== original.trim() &&
      preservesProtectedValues(original, sanitized)
    ) {
      return {
        original,
        corrected: sanitized.trim(),
        hasCorrections: true,
        source: 'LLM',
        status: 'EXTERNAL_AI',
      };
    }
  }

  // Deterministic dataset-based engine (no external AI required).
  const result = correctText(original);

  return {
    original,
    corrected: result.corrected,
    hasCorrections: result.hasCorrections,
    source: 'INSTITUTIONAL_GRAMMAR_ENGINE',
    status: result.status,
  };
}

/**
 * External LLM Helpers
 */
async function queryExternalLlmForBot(apiKey: string, model: string, question: string): Promise<string | null> {
  const prompt = `You are an expert academic mentoring consultant for K.S.R. College of Engineering (Autonomous).
Provide structured, highly practical, and professional advice to a faculty mentor answering this question:
"${question}"

Instructions:
1. Provide actionable steps, concrete exercises, and specific discussion points.
2. Structure with clear bullet points and numbered sections.
3. Be supportive, academic, and practical.
4. Do not include markdown code blocks or JSON formatting. Output clean, readable plain text.`;

  return new Promise((resolve) => {
    if (apiKey.startsWith('sk-')) {
      const payload = JSON.stringify({
        model: model.includes('gpt') ? model : 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
      });

      const req = https.request(
        {
          hostname: 'api.openai.com',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 7000,
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const text = parsed.choices?.[0]?.message?.content;
              if (text && text.trim()) return resolve(text.trim());
            } catch (e) {}
            resolve(null);
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(payload);
      req.end();
    } else {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      });

      const urlObj = new URL(geminiUrl);
      const req = https.request(
        {
          hostname: urlObj.hostname,
          path: `${urlObj.pathname}${urlObj.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 7000,
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text && text.trim()) return resolve(text.trim());
            } catch (e) {}
            resolve(null);
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(payload);
      req.end();
    }
  });
}

async function callExternalGrammarLlm(apiKey: string, model: string, text: string): Promise<string | null> {
  const prompt = `You are a professional grammar and spelling proofreader for college mentor counselling notes.
Proofread and correct the following text:
"${text}"

Rules:
1. Fix spelling mistakes, grammar errors, punctuation, and capitalization. Make the wording professional and natural.
2. PRESERVE THE WRITER'S INTENDED MEANING EXACTLY. Do not invent facts, names, problems, or academic details. Do not add or remove information.
3. NEVER alter official record values. Copy names, register numbers, certificate names, department names, subject codes, dates, marks, CGPA, SGPA, percentages and identifiers VERBATIM, character for character. Only the surrounding prose may change.
4. Output ONLY the corrected text. No preamble, no quotes, no labels, no explanations, no notes, no markdown.`;

  return new Promise((resolve) => {
    if (apiKey.startsWith('sk-')) {
      const payload = JSON.stringify({
        model: model.includes('gpt') ? model : 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      });

      const req = https.request(
        {
          hostname: 'api.openai.com',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 6000,
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const corrected = parsed.choices?.[0]?.message?.content;
              if (corrected && corrected.trim()) return resolve(corrected.trim());
            } catch (e) {}
            resolve(null);
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(payload);
      req.end();
    } else {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      });

      const urlObj = new URL(geminiUrl);
      const req = https.request(
        {
          hostname: urlObj.hostname,
          path: `${urlObj.pathname}${urlObj.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 6000,
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const corrected = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (corrected && corrected.trim()) return resolve(corrected.trim());
            } catch (e) {}
            resolve(null);
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(payload);
      req.end();
    }
  });
}
