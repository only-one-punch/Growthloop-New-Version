import { Note, InsightPlatform, NoteType, StackCategory } from '../types';
import { chatCompletion, imagesGenerate, ChatMessageContentPart } from './platoClient';

// 用例级模型固定为与旧实现一致的名称（由柏拉图平台侧适配）
const MODEL_ANALYZE = 'gemini-2.5-flash';
const MODEL_TITLE = 'gemini-2.5-flash';
const MODEL_CATEGORY = 'gemini-2.5-flash';
const MODEL_INSIGHTS = 'gemini-3-pro-preview';
const IMAGE_MODEL = import.meta.env.VITE_PLATO_IMAGE_MODEL || 'nano-banana-2-2k';

// ---------- Helpers ----------
const safeJSON = <T>(s: string, fallback: T): T => {
  try { return JSON.parse(s) as T } catch { return fallback; }
};

function buildNotesContext(allNotes: Note[]): string {
  return allNotes.map(n => `---\n内容: ${n.content}\n标签: ${(n.analysis?.tags || []).join(', ')}\n---`).join('\n');
}

// ---------- API Implementations (same signatures as original geminiService.ts) ----------

/** 笔记分析 + 可选图片OCR（OpenAI 兼容：把图片以 image_url 形式放入 messages） */
export const analyzeNoteContent = async (text: string, imageBase64?: string): Promise<{ category: string, tags: string[], sentiment: string }> => {
  if (!text && !imageBase64) {
    return { category: '未分类', tags: ['待处理'], sentiment: '中性' };
  }

  const system = `你是一个内容分析助手。\n任务：从用户输入的文本/图片中提取：category(中文)、3-5个中文tags、sentiment(积极/中性/消极)。\n只返回JSON：{ "category": string, "tags": string[], "sentiment": string }`;

  const parts: ChatMessageContentPart[] = [];
  if (imageBase64) {
    const b64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    parts.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } });
  }
  if (text) parts.push({ type: 'text', text });

  const reply = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: parts.length > 0 ? parts : '无内容' }
  ], { model: MODEL_ANALYZE, temperature: 0 });

  const fallback = { category: '常规', tags: ['人工复核'], sentiment: '中性' };
  return safeJSON(reply, fallback);
};

/** 生成简短标题 */
export const generateStackTitle = async (notes: Note[]): Promise<string> => {
  if (!notes.length) return '未命名卡片组';
  const contentSummary = notes.slice(0, 5).map(n => n.content).join('\n');
  const system = '你是标题生成器。规则：输出一个不超过10个字的中文标题，不要标点。只返回标题本身。';
  const reply = await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: contentSummary }
  ], { model: TEXT_MODEL, temperature: 0.5 });
  return (reply || '新的笔记组').replace(/[\s\n]+/g, '').slice(0, 20);
};

/** 判定栈类别 */
export const determineStackCategory = async (notes: Note[]): Promise<StackCategory> => {
  if (!notes.length) return StackCategory.GENERAL;
  const contentSummary = notes.map(n => n.content).join('\n---\n');
  const system = '请将内容归类到 TECH / LIFE / WISDOM / GENERAL 之一。只返回类别英文单词。';
  const reply = (await chatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: contentSummary }
  ], { model: TEXT_MODEL, temperature: 0 })).toUpperCase();

  if (reply.includes('TECH')) return StackCategory.TECH;
  if (reply.includes('LIFE')) return StackCategory.LIFE;
  if (reply.includes('WISDOM')) return StackCategory.WISDOM;
  return StackCategory.GENERAL;
};

/** 生成长文洞察（复用 Antigravity 规则与分类策略） */
export const generateInsights = async (notes: Note[], platform: InsightPlatform, category: StackCategory = StackCategory.GENERAL): Promise<string> => {
  if (!notes.length) return '没有可用的笔记进行分析。';

  // Flatten stacks -> notes
  const allNotes: Note[] = [];
  notes.forEach(n => {
    if (n.type === NoteType.STACK && n.stackItems) allNotes.push(...n.stackItems); else allNotes.push(n);
  });

  const notesContext = buildNotesContext(allNotes);

  const ANTIGRAVITY_LAYOUT_RULES = `
# Antigravity Layout Engine Rules (MUST FOLLOW STRICTLY)
1. 微排版：生成适合移动端阅读的 Markdown。
2. 段落：每段不超过4行，长句必须换行。
3. 加粗：每段仅允许一次 **加粗**，长度≤段落30%。
4. 锚点：每个 H2 章节末尾使用 > 引用 生成总结句。
5. 图片：需要配图时，单独一行输出 {{GEN_IMG: <英文描述>}}。`

  let systemPrompt = '';
  if (platform === InsightPlatform.SOCIAL_MEDIA) {
    systemPrompt = `你是社交媒体运营专家。生成适合小红书/Twitter 的中文短文案：\n1) 吸睛标题(含Emoji)\n2) 核心观点列表\n3) 金句\n4) Hashtags`;
  } else {
    switch (category) {
      case StackCategory.TECH:
        systemPrompt = ANTIGRAVITY_LAYOUT_RULES + `\n你是资深技术专家，写技术复盘文章（公众号移动端友好）:\n- 代码用代码块并标注语言\n- 段落≤3行，段距留白\n- 关键概念用 **加粗** 或 \`行内代码\`\n- 章节末尾用 > 引用 做总结`;
        break;
      case StackCategory.LIFE:
        systemPrompt = ANTIGRAVITY_LAYOUT_RULES + `\n你是生活方式博主，写有“杂志感”的随笔：\n- 每段≤2行、短句\n- 场景之间用 --- 或 Emoji 分隔\n- 情感金句用 > 引用 单独呈现`;
        break;
      case StackCategory.WISDOM:
        systemPrompt = ANTIGRAVITY_LAYOUT_RULES + `\n你是“芒格风格”的深度思考者：\n- 使用至少2个思维模型\n- H2/H3 清晰结构\n- 每个核心观点后用 > 引用 提炼金句`;
        break;
      default:
        systemPrompt = ANTIGRAVITY_LAYOUT_RULES + `\n生成“GrowthLoop 日报”：有标题、分模块、深度总结，中文输出。`;
    }
  }

  const user = `Input Data (User Notes):\n${notesContext}`;
  const reply = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: user }
  ], { model: TEXT_MODEL, temperature: 0.7 });

  return reply || '无法生成洞察。';
};

/** 社交配图（先生成英文提示词，再走生图模型） */
export const generateSocialImage = async (contextText: string): Promise<string | undefined> => {
  const promptGen = await chatCompletion([
    { role: 'system', content: 'You write concise image prompts in English only.' },
    { role: 'user', content: `Based on this content: "${contextText.substring(0, 500)}...", create a minimalist, abstract, digital brutalism style image prompt.` }
  ], { model: TEXT_MODEL, temperature: 0.7 });

  const img = await imagesGenerate(promptGen || 'abstract architectural composition, minimalist black and white', { model: IMAGE_MODEL, size: '1024x1024' });
  return img;
};

/** 文中配图 */
export const generateInContextImage = async (prompt: string): Promise<string | undefined> => {
  const styleSuffix = ', Digital Brutalism style, minimalist, black and white vector art, high contrast, architectural';
  return imagesGenerate(prompt + styleSuffix, { model: IMAGE_MODEL, size: '1024x576' });
};

/** 封面图 */
export const generateCoverImage = async (title: string): Promise<string | undefined> => {
  const coverPrompt = `Create a visually striking, minimalist cover image for a blog post titled "${title}". Style: Digital Brutalism, black and white, high contrast, architectural.`;
  return imagesGenerate(coverPrompt, { model: IMAGE_MODEL, size: '1024x576' });
};

