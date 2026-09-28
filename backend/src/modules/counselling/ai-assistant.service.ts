import https from 'https';

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
    };
  }

  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim() || 'gemini-1.5-flash';

  if (apiKey && original.length > 8) {
    try {
      const llmCorrected = await callExternalGrammarLlm(apiKey, model, original);
      if (llmCorrected && llmCorrected.trim() !== original.trim()) {
        return {
          original,
          corrected: llmCorrected.trim(),
          hasCorrections: true,
          source: 'LLM',
        };
      }
    } catch (err: any) {
      console.warn('External grammar check failed, applying rule-based engine:', err.message);
    }
  }

  // Rule-based spelling, capitalization, punctuation & grammar normalizer
  const corrected = runRuleBasedGrammarEngine(original);
  const hasCorrections = corrected.trim() !== original.trim();

  return {
    original,
    corrected,
    hasCorrections,
    source: 'INSTITUTIONAL_GRAMMAR_ENGINE',
  };
}

/**
 * Robust Rule-Based Institutional Grammar Engine
 */
function runRuleBasedGrammarEngine(raw: string): string {
  let str = raw.trim();

  // Common spelling corrections dictionary for college mentoring
  const spellMap: Record<string, string> = {
    comunication: 'communication',
    comunicate: 'communicate',
    presenation: 'presentation',
    presentaion: 'presentation',
    attandance: 'attendance',
    attendence: 'attendance',
    arrier: 'arrear',
    arriers: 'arrears',
    arear: 'arrear',
    arears: 'arrears',
    counceling: 'counselling',
    councelling: 'counselling',
    councelor: 'counsellor',
    counseling: 'counselling',
    counceler: 'counsellor',
    studnt: 'student',
    studnts: 'students',
    imporve: 'improve',
    imporvement: 'improvement',
    improvment: 'improvement',
    necesary: 'necessary',
    dificult: 'difficult',
    dificulty: 'difficulty',
    disscuss: 'discuss',
    disscussion: 'discussion',
    reccomend: 'recommend',
    recomended: 'recommended',
    reccommend: 'recommend',
    regularily: 'regularly',
    absentiesm: 'absenteeism',
    behaivor: 'behavior',
    behaivour: 'behaviour',
    asign: 'assign',
    asignment: 'assignment',
    asignments: 'assignments',
    preperation: 'preparation',
    prepair: 'prepare',
    consistant: 'consistent',
    confidance: 'confidence',
    guidence: 'guidance',
    proformance: 'performance',
    preformance: 'performance',
  };

  // Replace misspelled words using word boundary regex
  for (const [wrong, right] of Object.entries(spellMap)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    str = str.replace(regex, (match) => {
      // Match case
      if (match[0] === match[0].toUpperCase()) {
        return right.charAt(0).toUpperCase() + right.slice(1);
      }
      return right;
    });
  }

  // Grammar & Phrasing Normalizations
  str = str.replace(/\bstudent is not good in communication and he need improve presentation skill\b/gi,
    'Student needs to improve communication and presentation skills.');

  str = str.replace(/\bstudent is not good in\b/gi, 'Student needs improvement in');
  str = str.replace(/\bhe need improve\b/gi, 'he needs to improve');
  str = str.replace(/\bshe need improve\b/gi, 'she needs to improve');
  str = str.replace(/\bthey need improve\b/gi, 'they need to improve');
  str = str.replace(/\bstudent need improve\b/gi, 'student needs to improve');
  str = str.replace(/\bneed to improve presentation skill\b/gi, 'needs to improve presentation skills');
  str = str.replace(/\bpresentation skill\b/gi, 'presentation skills');
  str = str.replace(/\bcommunication skill\b/gi, 'communication skills');
  str = str.replace(/\bhe need to\b/gi, 'he needs to');
  str = str.replace(/\bshe need to\b/gi, 'she needs to');
  str = str.replace(/\bstudent need to\b/gi, 'student needs to');
  str = str.replace(/\bhe have\b/gi, 'he has');
  str = str.replace(/\bshe have\b/gi, 'she has');
  str = str.replace(/\bstudent have\b/gi, 'student has');
  str = str.replace(/\badviced\b/gi, 'advised');
  str = str.replace(/\bis having arrear\b/gi, 'has standing arrears');
  str = str.replace(/\bis having arrears\b/gi, 'has standing arrears');
  str = str.replace(/\blab observation book\b/gi, 'lab observation notebook');
  str = str.replace(/\bdo not doing\b/gi, 'is not doing');

  // Whitespace cleanup
  str = str.replace(/[ \t]+/g, ' ');

  // Fix standalone lowercase 'i' to 'I'
  str = str.replace(/\bi\b/g, 'I');

  // Capitalize first character of the text
  if (str.length > 0) {
    str = str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Capitalize letters following period, exclamation mark, or question mark
  str = str.replace(/([.!?]\s+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());

  // Ensure trailing punctuation if it looks like a complete sentence
  if (str.length > 5 && !/[.!?]$/.test(str)) {
    str += '.';
  }

  return str;
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
1. Fix all spelling mistakes, grammar errors, punctuation, and capitalization.
2. PRESERVE THE STAFF'S INTENDED MEANING 100%. Do not invent facts, student names, problems, or academic details.
3. Keep the tone concise, professional, and natural.
4. Output ONLY the corrected text. Do NOT add preamble, quotes, explanations, or notes.`;

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
