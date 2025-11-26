import React, { useState, useMemo, useEffect } from 'react';
import { Note, InsightPlatform, InsightHistoryItem, NoteType, StackCategory } from '../types';
import { generateInsights, generateSocialImage, generateInContextImage, generateCoverImage } from '@/services/geminiService';
import { Sparkles, Copy, Check, FileText, Share2, ArrowRight, History, Image as ImageIcon, X, Layers, Tag, ChevronLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface InsightGeneratorProps {
  notes: Note[];
  history: InsightHistoryItem[];
  onSaveToHistory: (item: InsightHistoryItem) => void;
  onOpenWorkbench: (item: InsightHistoryItem) => void;
}

interface TopicOption {
  id: string;
  type: 'STACK' | 'CATEGORY';
  title: string;
  count: number;
  notes: Note[];
  timestamp: number;
  stackCategory?: StackCategory;
}

const InsightGenerator: React.FC<InsightGeneratorProps> = ({ notes, history, onSaveToHistory, onOpenWorkbench }) => {
  const [generatedContent, setGeneratedContent] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedCover, setGeneratedCover] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [platform, setPlatform] = useState<InsightPlatform>(InsightPlatform.NEWSLETTER);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());

  // Topic Logic
  const topicOptions = useMemo(() => {
    const options: TopicOption[] = [];

    // Stacks
    notes.filter(n => n.type === NoteType.STACK).forEach(stack => {
      options.push({
        id: stack.id,
        type: 'STACK',
        title: stack.title || '未命名卡片组',
        count: stack.stackItems?.length || 0,
        notes: stack.stackItems || [],
        timestamp: stack.createdAt,
        stackCategory: stack.stackCategory || StackCategory.GENERAL
      });
    });

    // Loose Notes
    const looseNotes = notes.filter(n => n.type !== NoteType.STACK);
    if (looseNotes.length > 0) {
      // Correctly type the reduce accumulator using 'as' to avoid TSX parsing/typing issues with generics
      const grouped = looseNotes.reduce((acc, note) => {
        const cat = note.analysis?.category || '未分类';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(note);
        return acc;
      }, {} as Record<string, Note[]>);

      Object.entries(grouped).forEach(([category, catNotes]) => {
        options.push({
          id: `cat-${category}`,
          type: 'CATEGORY',
          title: `${category} (散记)`,
          count: catNotes.length,
          notes: catNotes,
          timestamp: Math.max(...catNotes.map(n => n.createdAt)),
          stackCategory: StackCategory.GENERAL
        });
      });
    }

    return options.sort((a, b) => b.timestamp - a.timestamp);
  }, [notes]);

  useEffect(() => {
    if (topicOptions.length > 0 && selectedTopicIds.size === 0) {
      setSelectedTopicIds(new Set(topicOptions.map(t => t.id)));
    }
  }, [topicOptions.length]);

  const handleToggleTopic = (id: string) => {
    const newSet = new Set(selectedTopicIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedTopicIds(newSet);
  };

  const processInContextImages = async (content: string): Promise<string> => {
    const imageRegex = /\{\{GEN_IMG: (.*?)\}\}/g;
    let processedContent = content;
    const matches = [...content.matchAll(imageRegex)];

    if (matches.length === 0) {
      setGeneratedContent(content);
      return content;
    }

    // Replace all matches with a loading placeholder first and update the UI
    const loadingContent = content.replace(imageRegex, "\n![Generating image...]()\n");
    setGeneratedContent(loadingContent);

    for (const match of matches) {
      const fullMatch = match[0];
      const prompt = match[1];

      try {
        const imageUrl = await generateInContextImage(prompt);
        const imageMarkdown = imageUrl
          ? `\n![${prompt.replace(/[\[\]]/g, '')}](${imageUrl})\n`
          : "\n*Failed to generate image.*\n";

        processedContent = processedContent.replace(fullMatch, imageMarkdown);

        // Update the UI incrementally with the generated image
        let tempContent = processedContent;
        // Keep other potential images in a loading state
        const remainingMatches = [...tempContent.matchAll(imageRegex)];
        remainingMatches.forEach(m => {
          tempContent = tempContent.replace(m[0], "\n![Generating image...]()\n");
        });
        setGeneratedContent(tempContent);

      } catch (error) {
        console.error(`Image generation failed for prompt: "${prompt}"`, error);
        processedContent = processedContent.replace(fullMatch, "\n*Image generation error.*\n");
        setGeneratedContent(processedContent);
      }
    }

    return processedContent;
  };

  const handleGenerate = async () => {
    if (selectedTopicIds.size === 0) return;

    setIsGenerating(true);
    setGeneratedContent('');
    setGeneratedImage(null);
    setGeneratedCover(null);

    const selectedTopics = topicOptions.filter(t => selectedTopicIds.has(t.id));
    const primaryCategory = selectedTopics.find(t => t.type === 'STACK')?.stackCategory || StackCategory.GENERAL;
    const selectedNotes: Note[] = [];
    selectedTopics.forEach(topic => selectedNotes.push(...topic.notes));

    const initialContent = await generateInsights(selectedNotes, platform, primaryCategory);

    let finalContent = initialContent;
    let imageUrl: string | undefined = undefined;
    let coverUrl: string | undefined = undefined;

    if (platform === InsightPlatform.SOCIAL_MEDIA) {
      setGeneratedContent(initialContent);
      imageUrl = await generateSocialImage(initialContent);
      if (imageUrl) setGeneratedImage(imageUrl);
    } else {
      // For articles, process the in-context images
      finalContent = await processInContextImages(initialContent);

      // After content is final, generate the cover
      const titleMatch = finalContent.match(/^#\s+(.*)/m);
      if (titleMatch && titleMatch[1]) {
        const title = titleMatch[1];
        coverUrl = await generateCoverImage(title);
        if (coverUrl) setGeneratedCover(coverUrl);
      }
    }

    onSaveToHistory({
      id: Date.now().toString(),
      content: finalContent, // Save the fully processed content
      platform: platform,
      createdAt: Date.now(),
      generatedImageUrl: platform === InsightPlatform.SOCIAL_MEDIA ? imageUrl : coverUrl,
      category: primaryCategory,
      relatedNotes: selectedNotes
    });

    setIsGenerating(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleHistoryItemClick = (item: InsightHistoryItem) => {
    onOpenWorkbench(item);
  };

  if (notes.length === 0 && history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50">
        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4">
           <Sparkles className="w-8 h-8 text-purple-200" />
        </div>
        <p className="font-medium text-sm">暂无数据，请先捕捉想法。</p>
      </div>
    );
  }

  return (
    <div className="flex gap-0 h-full w-full bg-slate-50">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative bg-white shadow-xl shadow-slate-200/50 z-10 rounded-l-3xl overflow-hidden ml-4 my-4 mb-4 border border-slate-100">

        {/* Header */}
        <div className="h-16 border-b border-slate-50 flex items-center justify-between px-8 bg-white sticky top-0 z-20">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
             <Sparkles className="w-5 h-5 text-purple-500" />
             洞察引擎
          </h2>

          <div className="flex items-center gap-3">
            {!generatedContent && (
              <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setPlatform(InsightPlatform.NEWSLETTER)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${platform === InsightPlatform.NEWSLETTER ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  公众号文章
                </button>
                <button
                  onClick={() => setPlatform(InsightPlatform.SOCIAL_MEDIA)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${platform === InsightPlatform.SOCIAL_MEDIA ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  社交媒体
                </button>
              </div>
            )}

            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-2 rounded-lg transition-colors ${showHistory ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
              title="历史记录"
            >
              <History className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-8 bg-white relative">

          {/* SELECTION VIEW */}
          {!generatedContent && !isGenerating && (
            <div className="max-w-3xl mx-auto w-full">
               {topicOptions.length > 0 ? (
                 <>
                  <div className="mb-8">
                    <h3 className="text-2xl font-bold text-slate-800 mb-2">今日话题池</h3>
                    <p className="text-slate-500">选择你想包含在本次洞察中的内容源。</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 mb-10">
                    {topicOptions.map(topic => (
                      <div
                        key={topic.id}
                        onClick={() => handleToggleTopic(topic.id)}
                        className={`
                          flex items-center justify-between p-5 rounded-2xl cursor-pointer transition-all border
                          ${selectedTopicIds.has(topic.id)
                            ? 'border-purple-500 bg-purple-50/30 shadow-md ring-1 ring-purple-500'
                            : 'border-slate-100 bg-white hover:border-slate-300 hover:shadow-sm'}
                        `}
                      >
                        <div className="flex items-center gap-5">
                          <div className={`p-3 rounded-xl ${topic.type === 'STACK' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>
                            {topic.type === 'STACK' ? <Layers className="w-5 h-5" /> : <Tag className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                               <h4 className="font-bold text-slate-800">
                                 {topic.title}
                               </h4>
                               {topic.type === 'STACK' && (
                                 <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                   {topic.stackCategory || 'GENERAL'}
                                 </span>
                               )}
                            </div>
                            <div className="text-xs text-slate-400 font-medium">
                               {topic.count} 条碎片 · {new Date(topic.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>

                        <div className={`
                          w-6 h-6 rounded-full flex items-center justify-center transition-all border
                          ${selectedTopicIds.has(topic.id) ? 'bg-purple-500 border-purple-500 text-white' : 'bg-white border-slate-200'}
                        `}>
                          {selectedTopicIds.has(topic.id) && <Check className="w-4 h-4" />}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={handleGenerate}
                      disabled={selectedTopicIds.size === 0}
                      className="bg-purple-600 text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-purple-500/30 hover:bg-purple-700 hover:shadow-purple-500/40 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      生成洞察 ({selectedTopicIds.size} 个主题) <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                 </>
               ) : (
                 <div className="text-center py-20 text-slate-300">
                    暂无有效内容
                 </div>
               )}
            </div>
          )}

          {/* LOADING STATE */}
          {isGenerating && (
            <div className="h-full flex flex-col items-center justify-center space-y-6">
               <div className="relative">
                 <div className="w-16 h-16 border-4 border-purple-100 border-t-purple-500 rounded-full animate-spin"></div>
                 <Sparkles className="w-6 h-6 text-purple-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
               </div>
               <p className="text-slate-500 font-medium animate-pulse">
                 AI 正在深度思考并重构内容...
               </p>
            </div>
          )}

          {/* GENERATED CONTENT */}
          {generatedContent && !isGenerating && (
            <div className="max-w-3xl mx-auto animate-in fade-in duration-500 pb-20">
              <button
                 onClick={() => setGeneratedContent('')}
                 className="mb-6 text-sm text-slate-400 hover:text-purple-600 flex items-center gap-1 font-medium transition-colors"
              >
                 <ChevronLeft className="w-4 h-4" /> 返回话题选择
              </button>

              {generatedCover && (
                <div className="w-full mb-8 rounded-2xl overflow-hidden shadow-lg border border-slate-100">
                  <img src={generatedCover} alt="AI Generated Cover" className="w-full h-auto" />
                  <div className="bg-slate-50 px-4 py-2 text-xs text-slate-400 text-center border-t border-slate-100">
                    AI 生成的封面图
                  </div>
                </div>
              )}

              {generatedImage && (
                <div className="w-full mb-8 rounded-2xl overflow-hidden shadow-lg border border-slate-100">
                  <img src={generatedImage} alt="AI Generated" className="w-full h-auto" />
                  <div className="bg-slate-50 px-4 py-2 text-xs text-slate-400 text-center border-t border-slate-100">
                    AI 为社交媒体贴文生成的配图
                  </div>
                </div>
              )}

              <article className="prose prose-slate prose-lg max-w-none
                prose-headings:font-bold prose-headings:text-slate-800
                prose-p:text-slate-600 prose-p:leading-relaxed
                prose-blockquote:border-l-4 prose-blockquote:border-purple-300 prose-blockquote:bg-purple-50 prose-blockquote:px-6 prose-blockquote:py-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic
                prose-strong:text-purple-700
                prose-img:rounded-xl prose-img:shadow-md
              ">
                <ReactMarkdown>{generatedContent}</ReactMarkdown>
              </article>
            </div>
          )}
        </div>

        {/* Action Bar */}
        {generatedContent && !isGenerating && (
          <div className="h-20 border-t border-slate-100 bg-white/80 backdrop-blur-md absolute bottom-0 w-full flex items-center justify-center">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 px-8 py-3 rounded-full font-bold transition-all shadow-md
                ${copied ? 'bg-green-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}
              `}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '一键复制内容'}
            </button>
          </div>
        )}
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="w-80 bg-slate-50 border-l border-slate-100 flex flex-col shadow-xl z-20 animate-in slide-in-from-right-10 duration-300 absolute right-0 h-full">
           <div className="h-16 border-b border-slate-100 flex items-center justify-between px-5 bg-white">
             <h3 className="font-bold text-slate-800">历史归档</h3>
             <button onClick={() => setShowHistory(false)} className="hover:bg-slate-100 p-2 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
               <X className="w-5 h-5" />
             </button>
           </div>
           <div className="overflow-auto flex-1 p-4 space-y-3">
             {history.length === 0 ? (
               <div className="text-center py-10 text-slate-400 text-sm">暂无历史记录</div>
             ) : (
               history.slice().reverse().map(item => (
                 <div
                   key={item.id}
                   onClick={() => handleHistoryItemClick(item)}
                   className="w-full text-left p-4 bg-white rounded-xl border border-slate-100 hover:border-purple-200 hover:shadow-md transition-all cursor-pointer group"
                 >
                   <div className="flex items-center justify-between mb-2">
                     <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${item.platform === InsightPlatform.SOCIAL_MEDIA ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}>
                       {item.platform === InsightPlatform.SOCIAL_MEDIA ? '社媒' : '文章'}
                     </span>
                     <span className="text-[10px] text-slate-400">
                       {new Date(item.createdAt).toLocaleDateString()}
                     </span>
                   </div>
                   {item.category && (
                      <div className="mb-2">
                         <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                           {item.category}
                         </span>
                      </div>
                   )}
                   <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed group-hover:text-slate-900">
                     {item.content.replace(/[#*`]/g, '')}
                   </p>
                 </div>
               ))
             )}
           </div>
        </div>
      )}
    </div>
  );
};

export default InsightGenerator;