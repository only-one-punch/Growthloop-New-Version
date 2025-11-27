
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { InsightHistoryItem, Note, NoteType, StackCategory, InsightPlatform } from '../types';
import {
  Copy, Check, Save, ChevronRight, Layout, Loader2, Sparkles
} from 'lucide-react';
import { generateInsights, generateSocialImage, generateInContextImage } from '../services/geminiService';
import ArticleRenderer from './ArticleRenderer';


interface ArticleArchitectProps {
  allNotes: Note[];
  history: InsightHistoryItem[];
  onSaveToHistory: (item: InsightHistoryItem) => void;
  onCreateStack: (notes: Note[]) => Promise<string>;
  onUpdateHistory: (id: string, newContent: string) => void;
}

const ArticleArchitect: React.FC<ArticleArchitectProps> = ({
  allNotes,
  history,
  onSaveToHistory,
  onCreateStack,
  onUpdateHistory
}) => {
  // --- STATE ---
  const [timeFilter, setTimeFilter] = useState<'TODAY' | 'WEEK' | 'ALL'>('TODAY');
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);

  // Configuration State (Zero State)
  const [targetPlatform, setTargetPlatform] = useState<InsightPlatform>(InsightPlatform.NEWSLETTER);
  const [styleStrategy, setStyleStrategy] = useState<StackCategory>(StackCategory.TECH);
  const [isGenerating, setIsGenerating] = useState(false);

  // Editor State
  const [activeHistoryItem, setActiveHistoryItem] = useState<InsightHistoryItem | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [imagePlaceholders, setImagePlaceholders] = useState<Record<string, { isLoading: boolean; url: string | null }>>({});


  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- DERIVED DATA ---

  // 1. Filtered Stacks & Inbox
  const { stackList, inboxNotes } = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;

    const isWithinTime = (timestamp: number) => {
      if (timeFilter === 'ALL') return true;
      if (timeFilter === 'WEEK') return (now - timestamp) < sevenDays;
      return (now - timestamp) < oneDay; // TODAY
    };

    // Filter loose notes for Inbox
    const loose = allNotes.filter(n => n.type !== NoteType.STACK && isWithinTime(n.createdAt));

    // Filter Stacks
    const stacks = allNotes.filter(n => n.type === NoteType.STACK && isWithinTime(n.createdAt));

    return { stackList: stacks, inboxNotes: loose };
  }, [allNotes, timeFilter]);

  // 2. Identify the currently selected "Source"
  const selectedSource = useMemo(() => {
    if (selectedStackId === 'INBOX') {
      return {
        id: 'INBOX',
        title: '未归档 (Inbox)',
        type: 'INBOX',
        items: inboxNotes,
        category: StackCategory.GENERAL
      };
    }
    const stack = stackList.find(s => s.id === selectedStackId);
    if (stack) {
      return {
        id: stack.id,
        title: stack.title || '未命名卡片组',
        type: 'STACK',
        items: stack.stackItems || [],
        category: stack.stackCategory || StackCategory.GENERAL
      };
    }
    return null;
  }, [selectedStackId, stackList, inboxNotes]);

  // 3. Find existing versions (history items) for the selected source
  const existingVersions = useMemo(() => {
    if (!selectedStackId || selectedStackId === 'INBOX') return [];
    return history.filter(h => h.stackId === selectedStackId);
  }, [selectedStackId, history]);

  // --- EFFECTS ---

  // Update style strategy default when source changes
  useEffect(() => {
    if (selectedSource) {
      setStyleStrategy(selectedSource.category);
    }
  }, [selectedSource?.id]);

  // Auto-select latest version if available
  useEffect(() => {
    if (existingVersions.length > 0) {
      setActiveHistoryItem(existingVersions[0]);
    } else {
      setActiveHistoryItem(null);
    }
  }, [selectedSource?.id, existingVersions.length]); // Depend on ID change or versions change

  // Sync editor content
  useEffect(() => {
    if (activeHistoryItem) {
      setEditorContent(activeHistoryItem.content);
    }
  }, [activeHistoryItem]);
  // Image Generation Effect
  useEffect(() => {
    if (!activeHistoryItem) return;

    const regex = /{{GEN_IMG: (.*?)}}/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(editorContent)) !== null) {
      const prompt = match[1];

      // Only fetch if this prompt has not been processed yet
      if (!imagePlaceholders[prompt]) {
        // Set loading state immediately to prevent re-fetching
        setImagePlaceholders(prev => ({ ...prev, [prompt]: { isLoading: true, url: null } }));

        generateInContextImage(prompt)
          .then(url => {
            setImagePlaceholders(prev => ({
              ...prev,
              [prompt]: { isLoading: false, url: url || null },
            }));
          })
          .catch(err => {
            console.error('Image generation failed:', err);
            setImagePlaceholders(prev => ({
              ...prev,
              [prompt]: { isLoading: false, url: null }, // Stop loading on error
            }));
          });
      }
    }
  }, [editorContent, activeHistoryItem]);

  const finalEditorContent = useMemo(() => {
    let tempContent = editorContent;
    Object.keys(imagePlaceholders).forEach(prompt => {
      const placeholder = `{{GEN_IMG: ${prompt}}}`;
      const state = imagePlaceholders[prompt];
      if (state.isLoading) {
        tempContent = tempContent.replace(placeholder, `\n<div style="text-align: center; padding: 1rem; background-color: #f1f5f9; border-radius: 0.5rem; margin: 1rem 0;">⏳ 正在生成图片...</div>\n`);
      } else if (state.url) {
        tempContent = tempContent.replace(placeholder, `\n![Generated image for prompt: ${prompt}](${state.url})\n`);
      } else {
        tempContent = tempContent.replace(placeholder, `\n<div style="text-align: center; padding: 1rem; background-color: #fee2e2; color: #dc2626; border-radius: 0.5rem; margin: 1rem 0;">❌ 图片生成失败</div>\n`);
      }
    });
    return tempContent;
  }, [editorContent, imagePlaceholders]);


  // --- HANDLERS ---

  const handleInitializeGeneration = async () => {
    if (!selectedSource || isGenerating) return;
    setIsGenerating(true);

    try {
      let finalStackId = selectedSource.id;
      let finalItems = selectedSource.items;

      // Special Logic: Inbox -> Stack Conversion
      if (selectedSource.type === 'INBOX') {
        finalStackId = await onCreateStack(selectedSource.items);
        // Note: onCreateStack updates parent state.
        // We need to wait for parent state update or use the returned ID to optimistically update locally if needed.
        // For simplicity, we assume the layout will refresh, but we need the ID to save history correctly.
      }

      const content = await generateInsights(finalItems, targetPlatform, styleStrategy);

      let imageUrl: string | undefined = undefined;
      if (targetPlatform === InsightPlatform.SOCIAL_MEDIA) {
         imageUrl = await generateSocialImage(content);
      }

      const newHistoryItem: InsightHistoryItem = {
        id: Date.now().toString(),
        content: content,
        platform: targetPlatform,
        createdAt: Date.now(),
        category: styleStrategy,
        relatedNotes: finalItems,
        stackId: finalStackId,
        generatedImageUrl: imageUrl
      };

      onSaveToHistory(newHistoryItem);

      // If we came from Inbox, we need to switch selection to the new stack
      if (selectedSource.type === 'INBOX') {
         setSelectedStackId(finalStackId);
      }

      // Select the new item
      setActiveHistoryItem(newHistoryItem);

    } catch (error) {
      console.error(error);
      alert("生成失败，请重试");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveEditor = () => {
    if (!activeHistoryItem) return;
    onUpdateHistory(activeHistoryItem.id, editorContent);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  // --- RENDER HELPERS ---

  const renderZeroState = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-50/80">
      <div className="max-w-lg w-full text-center">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">生成新的内容</h2>
        <p className="text-slate-500 mb-8">
          你已选择 <span className="font-semibold text-purple-600">{selectedSource?.items.length || 0}</span> 条笔记作为素材，请选择生成平台和风格。
        </p>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          {/* Strategy & Platform */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-3 text-left">内容风格</label>
              <select
                value={styleStrategy}
                onChange={e => setStyleStrategy(e.target.value as StackCategory)}
                className="w-full bg-slate-100 text-slate-700 font-semibold py-3 px-4 rounded-lg outline-none focus:ring-2 focus:ring-purple-400 border border-slate-200"
              >
                <option value={StackCategory.TECH}>技术</option>
                <option value={StackCategory.LIFE}>生活</option>
                <option value={StackCategory.WISDOM}>深度</option>
                <option value={StackCategory.GENERAL}>通用</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-3 text-left">目标平台</label>
              <div className="bg-slate-100 rounded-lg p-1 flex">
                <button
                  onClick={() => setTargetPlatform(InsightPlatform.NEWSLETTER)}
                  className={`w-1/2 py-2 text-sm font-bold rounded-md transition-colors ${targetPlatform === InsightPlatform.NEWSLETTER ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>
                  博客文章
                </button>
                <button
                  onClick={() => setTargetPlatform(InsightPlatform.SOCIAL_MEDIA)}
                  className={`w-1/2 py-2 text-sm font-bold rounded-md transition-colors ${targetPlatform === InsightPlatform.SOCIAL_MEDIA ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>
                  社交媒体
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleInitializeGeneration}
            disabled={isGenerating}
            className="w-full h-14 bg-purple-600 text-white font-bold text-base rounded-xl hover:bg-purple-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait shadow-lg shadow-purple-500/20"
          >
            {isGenerating ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> 正在生成...</>
            ) : (
              <><Sparkles className="w-5 h-5" /> 开始生成</>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const renderEditorState = () => (
    <div className="flex-1 flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-16 flex-shrink-0 px-6 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-3">
          {existingVersions.map((v, idx) => (
            <button
              key={v.id}
              onClick={() => setActiveHistoryItem(v)}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all
                ${activeHistoryItem?.id === v.id
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`
              }
            >
              {v.platform === InsightPlatform.SOCIAL_MEDIA ? '社媒' : '文章'} V{existingVersions.length - idx}
            </button>
          ))}
        </div>
        <button
          onClick={() => setActiveHistoryItem(null)} // Go back to config
          className="px-4 py-2 text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          + 新草稿
        </button>
      </div>

      {/* Editor Area */}
      <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
        {/* Left: Markdown Editor */}
        <textarea
          ref={textareaRef}
          value={editorContent}
          onChange={(e) => setEditorContent(e.target.value)}
          className="w-full h-full resize-none outline-none text-base leading-relaxed text-slate-800 placeholder:text-slate-400 bg-white p-8 md:p-12 overflow-y-auto"
          spellCheck={false}
          placeholder="开始写作..."
        />
        {/* Right: Live Preview */}
        <div className="w-full h-full bg-slate-50 border-l border-slate-200 overflow-y-auto">
          <ArticleRenderer content={finalEditorContent} />
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className="h-16 flex-shrink-0 px-6 flex items-center justify-end gap-4 border-t border-slate-100 bg-white/80 backdrop-blur-sm">
        <button
           onClick={handleSaveEditor}
           className="text-sm font-bold flex items-center gap-2 text-slate-600 hover:text-purple-600 transition-colors"
        >
           {isSaved ? <Check className="w-4 h-4 text-green-500" /> : <Save className="w-4 h-4" />} {isSaved ? '已保存' : '保存'}
        </button>
        <button
          onClick={() => { navigator.clipboard.writeText(finalEditorContent); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }}
          className="px-4 py-2 text-sm font-bold text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-2"
        >
           {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {isCopied ? '已复制!' : '复制 Markdown'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full bg-slate-50/50">

      {/* COL 2: SOURCE SELECTOR (Middle) */}
      <div className="w-96 border-r border-slate-200 flex flex-col bg-white">
        {/* Header */}
        <div className="h-16 flex-shrink-0 px-6 flex items-center justify-between border-b border-slate-100">
          <h2 className="font-bold text-lg text-slate-800">素材库</h2>
          <select
             value={timeFilter}
             onChange={(e) => setTimeFilter(e.target.value as any)}
             className="bg-slate-100 text-slate-600 text-xs font-semibold py-1 px-3 rounded-lg outline-none focus:ring-2 focus:ring-purple-400"
           >
             <option value="TODAY">今天</option>
             <option value="WEEK">本周</option>
             <option value="ALL">全部</option>
           </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Inbox Virtual Item */}
          {inboxNotes.length > 0 && (
            <div
              onClick={() => setSelectedStackId('INBOX')}
              className={`group p-4 rounded-xl cursor-pointer transition-all border-2
                ${selectedStackId === 'INBOX'
                  ? 'bg-purple-50 border-purple-300 shadow-sm'
                  : 'bg-white border-transparent hover:bg-slate-50'}`
              }
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800">📥 未归档笔记</span>
                {selectedStackId === 'INBOX' && <ChevronRight className="w-5 h-5 text-purple-600" />}
              </div>
              <p className="text-sm text-slate-500">{inboxNotes.length} 条零散的笔记</p>
            </div>
          )}

          {/* Stacks */}
          {stackList.map(stack => (
            <div
              key={stack.id}
              onClick={() => setSelectedStackId(stack.id)}
              className={`group p-4 rounded-xl cursor-pointer transition-all border-2
                ${selectedStackId === stack.id
                  ? 'bg-purple-50 border-purple-300 shadow-sm'
                  : 'bg-white border-transparent hover:bg-slate-50'}`
              }
            >
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-bold text-slate-800 line-clamp-1 pr-4">{stack.title}</h4>
                {selectedStackId === stack.id && <ChevronRight className="w-5 h-5 text-purple-600" />}
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <span>{stack.stackItems?.length} 条笔记</span>
                <span className="text-slate-300">·</span>
                <span>{stack.stackCategory || 'General'}</span>
              </div>
            </div>
          ))}

          {stackList.length === 0 && inboxNotes.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-400">
              这个时间段内没有素材
            </div>
          )}
        </div>
      </div>

      {/* COL 3: WORKSPACE (Right) */}
      <div className="flex-1 flex flex-col relative">
        {!selectedSource ? (
          <div className="flex-1 flex items-center justify-center bg-slate-50/80">
            <div className="text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-slate-100">
                <Layout className="w-7 h-7 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-500">选择一个素材开始创作</h3>
              <p className="text-slate-400 mt-1">从左侧选择一个卡片组或未归档的笔记</p>
            </div>
          </div>
        ) : (
          activeHistoryItem ? renderEditorState() : renderZeroState()
        )}
      </div>

    </div>
  );
};

export default ArticleArchitect;