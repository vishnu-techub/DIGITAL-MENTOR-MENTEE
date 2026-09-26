import https from 'https';

export interface AiSuggestionRequest {
  category: string;
  mentorPrompt: string;
  studentName?: string;
  registerNumber?: string;
  departmentCode?: string;
}

export interface AiSuggestionResponse {
  challengeObserved: string;
  correctiveAction: string;
  expectedImprovement: string;
  source: 'LLM' | 'INSTITUTIONAL_AI_ENGINE';
}

/**
 * Intelligent Institutional AI Counselling Engine for KSRCE Digital Mentoring
 */
export async function generateCounsellingSuggestion(
  params: AiSuggestionRequest
): Promise<AiSuggestionResponse> {
  const { category, mentorPrompt, studentName, registerNumber } = params;
  const promptLower = mentorPrompt.trim().toLowerCase();

  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim() || 'gemini-1.5-flash';

  // 1. Try external AI Provider if configured (Gemini / OpenAI compatible)
  if (apiKey) {
    try {
      const externalResult = await callExternalAiProvider(apiKey, model, category, mentorPrompt, studentName);
      if (externalResult) {
        return {
          ...externalResult,
          source: 'LLM',
        };
      }
    } catch (apiErr: any) {
      console.warn('External AI call failed, falling back to Institutional AI Engine:', apiErr.message);
    }
  }

  // 2. Intelligent Institutional Domain Knowledge System
  return generateDomainExpertSuggestion(category, promptLower, studentName || 'Student');
}

/**
 * Institutional AI Knowledge System (Rule-based NLP Engine)
 * Accurately parses short natural inputs like "weak in academic", "need skill improvement",
 * "not participating in events", "need placement preparation", "student interested in innovation"
 */
function generateDomainExpertSuggestion(
  category: string,
  prompt: string,
  studentName: string
): AiSuggestionResponse {
  // ACADEMIC DOMAIN
  if (category === 'Academic' || prompt.includes('academic') || prompt.includes('study') || prompt.includes('mark') || prompt.includes('cgpa') || prompt.includes('grade') || prompt.includes('exam') || prompt.includes('arrear')) {
    if (prompt.includes('arrear') || prompt.includes('fail') || prompt.includes('backlog')) {
      return {
        challengeObserved: `Student has standing academic arrears and requires dedicated remedial guidance and structured timetable allocation.`,
        correctiveAction: `1. Enrolled in departmental remedial coaching classes after college hours.\n2. Provided Anna University / Autonomous question banks and solved previous year papers.\n3. Assigned a peer-study buddy from top 10% of the class for peer learning.\n4. Weekly progress monitoring on concept clarity for arrear subjects.`,
        expectedImprovement: `Clear all standing arrears in the upcoming end-semester examinations with a minimum grade improvement to 'B+' or above.`,
        source: 'INSTITUTIONAL_AI_ENGINE',
      };
    }

    if (prompt.includes('math') || prompt.includes('analytic') || prompt.includes('calculus')) {
      return {
        challengeObserved: `Student faces difficulty in analytical and mathematical problem-solving steps during internal assessments.`,
        correctiveAction: `1. Recommended formula memorization chart and step-by-step problem breakdown worksheet.\n2. Directed to attend faculty tutorial sessions on Wednesday afternoons.\n3. Prescribed 5 practice problems daily with logbook verification by mentor.`,
        expectedImprovement: `Achieve 70%+ score in analytical unit tests and demonstrate confident step-by-step derivations.`,
        source: 'INSTITUTIONAL_AI_ENGINE',
      };
    }

    if (prompt.includes('attendance') || prompt.includes('absent') || prompt.includes('leave')) {
      return {
        challengeObserved: `Irregular attendance pattern identified, leading to missed lectures and lab exercise backlogs.`,
        correctiveAction: `1. Counseled student on 75% mandatory autonomous attendance requirement.\n2. Contacted parents to ensure timely bus commute from hometown.\n3. Arranged lab makeup session to complete pending experiments.`,
        expectedImprovement: `Maintain consistent 85%+ attendance across all theory and laboratory courses for the remainder of the semester.`,
        source: 'INSTITUTIONAL_AI_ENGINE',
      };
    }

    // General Academic Default
    return {
      challengeObserved: `Student requires structured academic focus, concept revision, and improved internal assessment performance.`,
      correctiveAction: `1. Formulated a 2-hour daily evening revision schedule balancing theory and numerical practice.\n2. Advised to consult subject teachers during mentoring hours to clarify doubts.\n3. Recommended utilizing KSRCE digital library NPTEL video lectures and standard reference books.`,
      expectedImprovement: `Consistent SGPA elevation by at least 0.5 to 1.0 points in the forthcoming continuous internal evaluation (CIE).`,
      source: 'INSTITUTIONAL_AI_ENGINE',
    };
  }

  // TRAINING & PLACEMENT DOMAIN
  if (category === 'Training & Placement' || prompt.includes('placement') || prompt.includes('interview') || prompt.includes('aptitude') || prompt.includes('resume') || prompt.includes('job') || prompt.includes('company')) {
    if (prompt.includes('aptitude') || prompt.includes('quant') || prompt.includes('reasoning')) {
      return {
        challengeObserved: `Student needs intensive speed and accuracy enhancement in Quantitative Aptitude and Logical Reasoning.`,
        correctiveAction: `1. Mandated daily practice on IndiaBIX and institutional placement portal (15 questions/day).\n2. Assigned speed-math techniques module and weekly aptitude assessment tests.\n3. Faculty review of weak topics (Time & Work, Permutations, Syllogisms).`,
        expectedImprovement: `Score above 75th percentile in institutional company-specific mock aptitude screening tests.`,
        source: 'INSTITUTIONAL_AI_ENGINE',
      };
    }

    if (prompt.includes('resume') || prompt.includes('profile') || prompt.includes('linkedin') || prompt.includes('portfolio')) {
      return {
        challengeObserved: `Student lacks a standardized technical resume and active professional LinkedIn / GitHub profile presence.`,
        correctiveAction: `1. Guided student to format resume according to KSRCE Career Guidance Cell standard template.\n2. Added 2 verified capstone academic projects with live GitHub repository links.\n3. Created professional LinkedIn profile highlighting core engineering competencies.`,
        expectedImprovement: `Comprehensive, ATS-compliant single-page resume ready for corporate drives with active verified project links.`,
        source: 'INSTITUTIONAL_AI_ENGINE',
      };
    }

    return {
      challengeObserved: `Student needs dedicated pre-placement preparation covering coding rounds, technical interview fundamentals, and HR discussions.`,
      correctiveAction: `1. Enrolled student in College Placement Cell mock interview drills and group discussion sessions.\n2. Prescribed weekly practice on LeetCode/HackerRank covering fundamental data structures (Arrays, Strings, Trees).\n3. Conducted one-on-one mentor mock technical interview with constructive feedback.`,
      expectedImprovement: `Clear initial round of on-campus placement assessments and present confidently in HR/Technical interview panels.`,
      source: 'INSTITUTIONAL_AI_ENGINE',
    };
  }

  // SKILL DEVELOPMENT DOMAIN
  if (category === 'Skill Development' || prompt.includes('skill') || prompt.includes('communication') || prompt.includes('english') || prompt.includes('coding') || prompt.includes('technical')) {
    if (prompt.includes('communication') || prompt.includes('english') || prompt.includes('speak') || prompt.includes('shy') || prompt.includes('hesitant')) {
      return {
        challengeObserved: `Student exhibits hesitation and lack of fluency in formal English communication and technical presentations.`,
        correctiveAction: `1. Encouraged active participation in English Language Lab audio-visual exercises.\n2. Assigned a 3-minute technical paper presentation in the next mentoring circle.\n3. Recommended watching BBC English learning podcasts and reading daily editorial articles.`,
        expectedImprovement: `Demonstrate confident verbal articulation during seminar presentations and viva-voce examinations without inhibition.`,
        source: 'INSTITUTIONAL_AI_ENGINE',
      };
    }

    if (prompt.includes('coding') || prompt.includes('python') || prompt.includes('java') || prompt.includes('software')) {
      return {
        challengeObserved: `Student lacks practical hands-on programming confidence and requires problem-solving practice in modern stacks.`,
        correctiveAction: `1. Enrolled in NPTEL / Coursera programming certification course with mentor tracking.\n2. Recommended daily 1-hour problem solving on CodeChef / HackerRank.\n3. Directed to build a mini CRUD application demonstrating database and frontend connectivity.`,
        expectedImprovement: `Complete minimum 50 coding problems on online judge and earn verified skill badge before semester end.`,
        source: 'INSTITUTIONAL_AI_ENGINE',
      };
    }

    return {
      challengeObserved: `Student requires improvement in the selected practical technical and professional skill area.`,
      correctiveAction: `1. Recommend relevant practice, participation in skill workshops, and hands-on lab building activities.\n2. Assigned targeted micro-project aligning with current industry engineering standards.\n3. Scheduled bi-weekly mentor review of skill logbook and portfolio additions.`,
      expectedImprovement: `Improved confidence, practical technical ability, and consistency in executing laboratory and real-world tasks.`,
      source: 'INSTITUTIONAL_AI_ENGINE',
    };
  }

  // INNOVATION & RESEARCH DOMAIN
  if (category === 'Innovation' || prompt.includes('innovation') || prompt.includes('idea') || prompt.includes('project') || prompt.includes('patent') || prompt.includes('startup') || prompt.includes('research')) {
    return {
      challengeObserved: `Student demonstrates curiosity for innovative concepts but needs structured mentorship to translate ideas into prototype / paper submission.`,
      correctiveAction: `1. Connected student with KSRCE Institution's Innovation Council (IIC) and Incubation Centre.\n2. Guided on literature survey methodology using IEEE Xplore and Scopus indexed publications.\n3. Assisted in formulating project proposal for Tamil Nadu State Council for Science & Technology (TNSCST) student project scheme.\n4. Encouraged building proof-of-concept prototype in department Makerspace.`,
      expectedImprovement: `Successful completion of working prototype and submission of research paper to a Scopus-indexed national or international conference.`,
      source: 'INSTITUTIONAL_AI_ENGINE',
    };
  }

  // EXTRA-CURRICULAR / CO-CURRICULAR DOMAIN
  if (category === 'Extra-Curricular / Co-Curricular' || prompt.includes('participat') || prompt.includes('event') || prompt.includes('symposium') || prompt.includes('sports') || prompt.includes('club') || prompt.includes('inactive')) {
    return {
      challengeObserved: `Student exhibits low engagement in co-curricular technical symposiums, hackathons, and campus club activities.`,
      correctiveAction: `1. Motivated student to register as a team member in upcoming inter-college national symposium.\n2. Recommended joining department technical club (Coding Club / Robotics Club / Rotaract).\n3. Assigned presentation role in intra-departmental seminar to cultivate stage presence.\n4. Provided attendance on-duty (OD) processing guidance for external collegiate events.`,
      expectedImprovement: `Active participation in at least 2 inter-collegiate events per semester and submission of participation certificates.`,
      source: 'INSTITUTIONAL_AI_ENGINE',
    };
  }

  // GENERAL DEFAULT
  return {
    challengeObserved: `Student requires guidance and systematic improvement in ${category.toLowerCase()} performance and daily discipline.`,
    correctiveAction: `1. Formulated customized action roadmap with actionable milestones monitored every Saturday.\n2. Encouraged active dialogue with course faculty and mentor during office hours.\n3. Recommended structured study material and participation in co-curricular skill enrichment.`,
    expectedImprovement: `Notable enhancement in academic consistency, personal confidence, and verified performance metrics.`,
    source: 'INSTITUTIONAL_AI_ENGINE',
  };
}

/**
 * External LLM API Provider Caller (Gemini / OpenAI API compatible)
 */
async function callExternalAiProvider(
  apiKey: string,
  model: string,
  category: string,
  prompt: string,
  studentName?: string
): Promise<{ challengeObserved: string; correctiveAction: string; expectedImprovement: string } | null> {
  const systemPrompt = `You are a Senior Faculty Mentor & Academic Counselor at K.S.R. College of Engineering (Autonomous), Tiruchengode, Tamil Nadu.
The mentor has provided an observation regarding a student (${studentName || 'Student'}).
Category: ${category}
Mentor input: "${prompt}"

Provide an empathetic, highly professional, actionable institutional counselling recommendation strictly in valid JSON format:
{
  "challengeObserved": "concise description of the observed issue or area of improvement",
  "correctiveAction": "concrete, bulleted or numbered step-by-step guidance, action plan, and prescribed activities",
  "expectedImprovement": "measurable, realistic outcomes and targets expected from the student"
}
Output only the JSON object. Do not enclose in markdown code fences.`;

  return new Promise((resolve) => {
    // If OpenAI key (starts with sk-)
    if (apiKey.startsWith('sk-')) {
      const data = JSON.stringify({
        model: model.includes('gpt') ? model : 'gpt-4o-mini',
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      });

      const req = https.request(
        {
          hostname: 'api.openai.com',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(data),
          },
          timeout: 6000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const content = parsed.choices?.[0]?.message?.content;
              const json = JSON.parse(content);
              if (json.challengeObserved && json.correctiveAction && json.expectedImprovement) {
                return resolve(json);
              }
            } catch (e) {
              // fallback
            }
            resolve(null);
          });
        }
      );

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.write(data);
      req.end();
    } else {
      // Default to Google Gemini API
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
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
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              const json = JSON.parse(text);
              if (json.challengeObserved && json.correctiveAction && json.expectedImprovement) {
                return resolve(json);
              }
            } catch (e) {
              // fallback
            }
            resolve(null);
          });
        }
      );

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.write(payload);
      req.end();
    }
  });
}
