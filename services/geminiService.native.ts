
import { GoogleGenAI, Type } from "@google/genai";
import { Note, InsightPlatform, NoteType, StackCategory } from "../types";

// NOTE: In a production environment, never expose API keys on the client side.
// This is structured to use the environment variable as requested.
const apiKey = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

/**
 * 分析新的笔记内容以提取类别、标签，并在需要时执行 OCR。
 * 使用 Gemini 2.5 Flash 以提高速度和效率。
 */
export const analyzeNoteContent = async (text: string, imageBase64?: string): Promise<{ category: string, tags: string[], sentiment: string }> => {
  if (!apiKey) {
    console.warn("未找到 API Key。返回模拟分析结果。");
    return {
      category: "未分类",
      tags: ["待处理"],
      sentiment: "中性"
    };
  }

  const parts: any[] = [];

  if (imageBase64) {
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data
      }
    });
  }

  if (text) {
    parts.push({ text });
  }

  const prompt = `
    分析以下内容（可能包含文本和/或图片）。
    1. 如果有带有文字的图片，请执行 OCR 并将该文字视为内容的一部分。
    2. 将内容归类为一个大类（例如：技术、设计、哲学、生活、工作、阅读）。
    3. 生成 3-5 个具体的中文标签。
    4. 确定情感倾向（积极、中性、消极）。
    请直接返回 JSON 格式。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [...parts, { text: prompt }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            sentiment: { type: Type.STRING }
          },
          required: ["category", "tags", "sentiment"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    throw new Error("响应为空");

  } catch (error) {
    console.error("Gemini 分析失败:", error);
    return {
      category: "常规",
      tags: ["人工复核"],
      sentiment: "中性"
    };
  }
};

/**
 * 为卡片组生成简短标题
 */
export const generateStackTitle = async (notes: Note[]): Promise<string> => {
  if (!apiKey || notes.length === 0) return "未命名卡片组";

  const contentSummary = notes.slice(0, 5).map(n => n.content).join("\n");

  const prompt = `
    阅读以下几条笔记的内容，为这个笔记集合生成一个非常简短、精准的中文标题（不超过 10 个字）。
    例如：“React 状态管理”、“周末读书笔记”、“UI 设计灵感”。
    不要加任何标点符号。

    内容：
    ${contentSummary}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    return response.text?.trim() || "新的笔记组";
  } catch (error) {
    return "新的笔记组";
  }
};

/**
 * 确定卡片组的分类 (TECH, LIFE, WISDOM, GENERAL)
 */
export const determineStackCategory = async (notes: Note[]): Promise<StackCategory> => {
  if (!apiKey || notes.length === 0) return StackCategory.GENERAL;

  const contentSummary = notes.map(n => n.content).join("\n---\n");

  const prompt = `
    分析以下笔记集合的内容风格，并将其归类为以下四类之一：
    1. TECH: 包含代码、技术框架、编程问题、软件架构等。
    2. LIFE: 日常生活、情感感悟、游记、美食、碎碎念。
    3. WISDOM: 读书笔记、哲学思考、商业思维模型、深度认知、查理芒格风格。
    4. GENERAL: 无法明确归类的内容。

    仅返回类别名称（例如 "TECH"），不要返回其他内容。

    内容：
    ${contentSummary}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const text = response.text?.trim().toUpperCase();
    if (text?.includes("TECH")) return StackCategory.TECH;
    if (text?.includes("LIFE")) return StackCategory.LIFE;
    if (text?.includes("WISDOM")) return StackCategory.WISDOM;
    return StackCategory.GENERAL;

  } catch (error) {
    console.error("分类判定失败:", error);
    return StackCategory.GENERAL;
  }
};

/**
 * 为社交媒体生成配图
 * 使用 Gemini 2.5 Flash Image (Nano Banana)
 */
export const generateSocialImage = async (contextText: string): Promise<string | undefined> => {
  if (!apiKey) return undefined;

  try {
    // 1. 先生成一个适合画图的英文 Prompt
    const promptGenResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Based on this content: "${contextText.substring(0, 500)}...", create a minimalist, abstract, Swiss-style, high-end digital brutalism image prompt. Use keywords like: "architectural, monochrome, grain, layout, structure". Return ONLY the prompt text in English.`,
    });

    const imagePrompt = promptGenResponse.text || "abstract architectural composition, minimalist lines, monochrome digital art, swiss style poster";

    // 2. 调用生图模型
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: imagePrompt }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1", // 社交媒体方形图
        }
      }
    });

    // 提取图片
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64EncodeString: string = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }

    return undefined;
  } catch (error) {
    console.error("图片生成失败:", error);
    return undefined;
  }
};

/**
 * 根据文章上下文中的指令生成配图。
 * Enforces the "Antigravity" style.
 */
export const generateInContextImage = async (prompt: string): Promise<string | undefined> => {
  if (!apiKey) {
    console.warn("API Key not found. Skipping image generation.");
    return undefined;
  }

  // Enforce the unified "Antigravity" style
  const styleSuffix = ", Digital Brutalism style, minimalist, black and white vector art, high contrast, architectural";
  const finalPrompt = prompt + styleSuffix;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: finalPrompt }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9", // Landscape for articles
        }
      }
    });

    // Extract the image
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64EncodeString: string = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }

    return undefined;
  } catch (error) {
    console.error("In-context image generation failed:", error);
    return undefined;
  }
};

/**
 * 从笔记集合生成深度洞察/总结。
 * 使用 Gemini 3.0 Pro 获取更强的推理能力。
 * 根据 stackCategory 动态选择 System Prompt。
 */
export const generateInsights = async (notes: Note[], platform: InsightPlatform, category: StackCategory = StackCategory.GENERAL): Promise<string> => {
  if (!apiKey) return "API Key 缺失。请配置 process.env.API_KEY。";
  if (notes.length === 0) return "没有可用的笔记进行分析。";

  // Flatten notes if there are stacks (though usually we generate from a single stack or list of notes)
  const allNotes: Note[] = [];
  notes.forEach(n => {
    if (n.type === NoteType.STACK && n.stackItems) {
      allNotes.push(...n.stackItems);
    } else {
      allNotes.push(n);
    }
  });

  const notesContext = allNotes.map(n => `
    ---
    内容: ${n.content}
    标签: ${n.analysis?.tags.join(', ')}
    ---
  `).join('\n');

  let systemPrompt = "";

  const ANTIGRAVITY_LAYOUT_RULES = `
# Antigravity Layout Engine Rules (MUST FOLLOW STRICTLY)

1.  **Micro-Typography**: You are a magazine editor, not just a writer. Your primary goal is to create a visually pleasing and readable layout.
2.  **Segmentation (Line Breaks)**:
    -   **Strict Rule**: NEVER output a paragraph longer than 4 lines (approximately 150 characters).
    -   **Action**: If a thought is longer, you MUST break it into multiple smaller paragraphs. Create a sense of rhythm and "breathability".
3.  **Highlighting (Bold Text)**:
    -   **Identify "Golden Sentences"**: In each paragraph, identify the single most important, high-information-density phrase or sentence.
    -   **Format**: Wrap this phrase with **.
    -   **Constraint**:
        -   **Limit**: Maximum ONE **bold** section per paragraph.
        -   **Length**: The bolded text must NOT exceed 30% of the total paragraph length. Avoid long black bars of text.
4.  **Anchoring (Blockquotes)**:
    -   **Strict Rule**: At the end of EVERY H2 (##) section, you MUST provide a summary sentence.
    -   **Format**: This summary MUST be formatted as a > blockquote.
5.  **AI Image Generation (In-Context)**:
    -   **Decision Power**: You have the authority to decide where an image is needed to explain a concept visually.
        -   **Action**: When you decide to insert an image, output the special token: \`{{GEN_IMG: <Your descriptive prompt for the image>}}\`.
    -   **Prompt Content**: The prompt inside the token should be a clear, English description of the desired image (e.g., "An abstract data stream flowing into a human brain"). The backend will handle the art style.
        -   **Placement Constraint**: The \`{{GEN_IMG}}\` token MUST ONLY be placed on its own line, between paragraphs or directly under an H2 heading. NEVER place it inside a sentence.
`;

  if (platform === InsightPlatform.SOCIAL_MEDIA) {
    systemPrompt = `
      # Role
      你是一位熟练的社交媒体运营专家。

      # 任务
      将用户提供的素材整理成一篇适合小红书/Twitter 的短文案。

      # 格式要求
      1. 爆款标题 (带 Emoji，吸引眼球)
      2. 核心观点列表 (使用 Emoji 如 🔸、📌 作为列表头)
      3. 金句总结 (Key Takeaway)
      4. 标签 (Hashtags)
      语气: 有冲击力、高信息密度、易于分享。
      语言: 简体中文。
    `;
  } else {
    // 公众号文章模式：根据分类选择策略
    switch (category) {
      case StackCategory.TECH:
        systemPrompt = ANTIGRAVITY_LAYOUT_RULES + `
# Role
你是一位拥有15年经验的资深技术专家（Tech Lead），擅长将复杂的工程问题转化为清晰、深度的技术博客。

# Context
我将提供一些开发过程中的代码片段或技术笔记。你需要帮我整理成一篇高质量的技术复盘文章，并适配微信公众号的移动端阅读体验。

# Constraints & Content Style
1. **深度**：不仅解释原理，必须解释“Why it works”和“底层逻辑”。
2. **语气**：专业、客观、去情绪化，拒绝废话。
3. **结构**：逻辑严密，层级分明。

# 📱 WeChat Layout Rules (必须严格遵守的排版规则)
1. **Markdown格式**：输出标准的 Markdown。
2. **代码高亮**：所有代码必须包裹在 code block 中，并指定语言（如 \`\`\`python）。
3. **呼吸感**：正文段落**每段不超过 3 行**，段与段之间必须空一行。
4. **重点突出**：核心概念和关键参数使用 **加粗** 或 \`行内代码\` 标记。
5. **模块化**：使用 \`> 引用块\` 来展示“注意事项”、“背景信息”或“总结”。
6. **标题**：使用 H2 (##) 作为主标题，H3 (###) 作为子标题，不要使用 H1。

# Workflow
1. **标题**：生成一个吸引技术人的标题（无需 Emoji，简练有力）。
2. **背景与痛点**：简短描述问题背景（使用普通文本）。
3. **核心方案 & 原理**：
   - 展示代码。
   - 使用 *无序列表* 解析关键点。
4. **优化/对比**：如有旧代码，进行对比分析。
5. **总结**：使用 \`> 引用块\` 总结最佳实践。
        `;
        break;

      case StackCategory.LIFE:
        systemPrompt = ANTIGRAVITY_LAYOUT_RULES + `
# Role
你是一位拥有百万粉丝的生活方式博主，文笔细腻、温暖。你需要将碎片记录整理成一篇适合手机阅读的、有“杂志感”的公众号随笔。

# Context
将日常碎片记录串联成一篇温暖的文章，引发共鸣。

# Constraints & Content Style
1. **五感描写**：多描写光影、气味、声音。
2. **情感共鸣**：从琐事中提炼小确幸。
3. **语言风格**：轻快、治愈、有画面感。

# 📱 WeChat Layout Rules (必须严格遵守的排版规则)
1. **极简主义**：**每段话不超过 2 行**，句子要短促有力。
2. **视觉分割**：不同场景之间使用 \`---\` 分割线，或者使用 "✨ / 🌿 / ☕️" 等 Emoji 单独占一行作为分割。
3. **金句高亮**：文章中的情感金句，请使用 \`> 引用块\` 单独展示。
4. **Emoji 列表**：尽量不使用数字列表（1.2.3.），而是使用 Emoji（如 🔸、📌、🤍）作为列表头。
5. **加粗**：仅对最触动人心的词句进行 **加粗**。

# Workflow
1. **标题**：3个备选标题（包含 Emoji，文艺风）。
2. **导语**：一段简短的引入（斜体）。
3. **正文**：按场景串联，保持流动的阅读感。
4. **结语**：用一段温暖的话收尾。


        `;
        break;

      case StackCategory.WISDOM:
        systemPrompt = ANTIGRAVITY_LAYOUT_RULES + `
# Role
你是一位具有“查理·芒格”风格的深度思考者。你擅长用“多元思维模型”拆解复杂问题。你需要将这些思考整理成一篇结构清晰、适合深度阅读的公众号文章。

# Context
对读书笔记或灵感进行系统化重构，提炼底层逻辑。

# Constraints & Content Style
1. **思维模型**：必须显式引用至少 2 个经典模型（如熵增、复利、第一性原理）。
2. **洞察力**：拒绝肤浅，输出反直觉的结论。
3. **金句化**：将核心观点凝练成易传播的句子。

# 📱 WeChat Layout Rules (必须严格遵守的排版规则)
1. **结构化**：必须使用 H2 (##) 和 H3 (###) 清晰划分逻辑层次。
2. **金句卡片**：每一个核心观点结束后，用 \`> 引用块\` 提炼一句总结性金句。
3. **重点加粗**：对关键的逻辑转折点和定义进行 **加粗**，方便读者扫读。
4. **列表清晰**：分析过程使用无序列表，避免大段文字堆砌。
5. **段落控制**：即使是深度文章，一段也不要超过 4 行。

# Workflow
1. **核心观点**：开篇明义，直接抛出反直觉的结论。
2. **模型拆解**：
   - ## 模型一：[名称]
   - 分析内容...
   - > 💡 模型启示：...
3. **深度推论**：结合实际场景的分析。
4. **芒格式格言**：结尾仿写一句格言（加粗+引用）。
        `;
        break;

      default: // GENERAL
        systemPrompt = ANTIGRAVITY_LAYOUT_RULES + `
          任务：生成一份“GrowthLoop 日报”。
          格式要求：
          1. 标题：生成一个有吸引力的日报标题。
          2. 结构化输出：根据笔记内容聚类成不同的模块。
          3. 总结：综合碎片信息，写出一段有深度的总结。
          4. 语气：专业、智慧。
          5. 语言：简体中文。
        `;
        break;
    }
  }

  const prompt = `
    ${systemPrompt}

    Input Data (User Notes):
    ${notesContext}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt
    });

    return response.text || "无法生成洞察。";
  } catch (error) {
    console.error("Gemini 生成失败:", error);
    return "生成洞察时出错，请重试。";
  }
};


/**
 * Generates a cover image for the article.
 */
export const generateCoverImage = async (title: string): Promise<string | undefined> => {
  if (!apiKey) {
    console.warn("API Key not found. Skipping cover generation.");
    return undefined;
  }

  const prompt = `
    Create a visually striking, minimalist cover image for a blog post titled "${title}".
    Style: Digital Brutalism, black and white, high contrast, architectural, Swiss typography.
    Composition: The title should be the main focus, using a bold, sans-serif font. Add abstract geometric elements or lines to create a sense of structure and space.
    Do not include any other text or logos.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: prompt }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64EncodeString: string = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }

    return undefined;
  } catch (error) {
    console.error("Cover image generation failed:", error);
    return undefined;
  }
};