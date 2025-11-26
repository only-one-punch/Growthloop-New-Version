
import React, { useState, useEffect } from 'react';
import { PenTool, Sparkles, Layout, ChevronRight, FileText } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

import NoteInput from './components/NoteInput';
import NoteCard from './components/NoteCard';
import InsightGenerator from './components/InsightGenerator';
import StackDetailModal from './components/StackDetailModal';
import ArticleArchitect from './components/HistoryWorkbench'; // Renamed import for clarity, though file is still HistoryWorkbench.tsx
import PlatoTest from './components/PlatoTest';
import { analyzeNoteContent, generateStackTitle, determineStackCategory } from '@/services/geminiService';
import { Note, NoteType, CategoryData, InsightHistoryItem, StackCategory, InsightPlatform } from './types';

// Helper for ID generation
const generateId = () => Math.random().toString(36).substr(2, 9);

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [insightHistory, setInsightHistory] = useState<InsightHistoryItem[]>([]);
  const [view, setView] = useState<'capture' | 'insights' | 'architect' | 'plato'>('capture');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedStack, setSelectedStack] = useState<Note | null>(null);

  // Load notes and history
  useEffect(() => {
    const savedNotes = localStorage.getItem('growthloop_notes');
    if (savedNotes) setNotes(JSON.parse(savedNotes));

    const savedHistory = localStorage.getItem('growthloop_history');
    if (savedHistory) setInsightHistory(JSON.parse(savedHistory));
  }, []);

  // Save notes
  useEffect(() => {
    localStorage.setItem('growthloop_notes', JSON.stringify(notes));
  }, [notes]);

  // Save history
  useEffect(() => {
    localStorage.setItem('growthloop_history', JSON.stringify(insightHistory));
  }, [insightHistory]);

  const handleSaveNote = async (content: string, imageBase64?: string) => {
    setIsProcessing(true);
    const tempId = generateId();

    const newNote: Note = {
      id: tempId,
      content,
      imageBase64,
      createdAt: Date.now(),
      type: imageBase64 ? (content ? NoteType.MIXED : NoteType.IMAGE) : NoteType.TEXT,
      isProcessing: true,
      analysis: { category: '常规', tags: [], sentiment: '中性' }
    };

    setNotes(prev => [newNote, ...prev]);

    try {
      const analysis = await analyzeNoteContent(content, imageBase64);
      setNotes(prev => prev.map(n =>
        n.id === tempId ? { ...n, analysis, isProcessing: false } : n
      ));
    } catch (e) {
      console.error("Analysis failed", e);
      setNotes(prev => prev.map(n =>
        n.id === tempId ? { ...n, isProcessing: false } : n
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToHistory = (item: InsightHistoryItem) => {
    setInsightHistory(prev => [item, ...prev]);
  };

  const handleUpdateHistory = (id: string, newContent: string) => {
    setInsightHistory(prev => prev.map(item =>
      item.id === id ? { ...item, content: newContent } : item
    ));
  };

  const handleOpenWorkbench = (item: InsightHistoryItem) => {
    // For now, redirect to architect view. In a real app, we might pass the selected item ID to pre-select it.
    setView('architect');
  };

  const handleUpdateNote = (noteId: string, newContent: string) => {
    setNotes(prev => prev.map(n =>
      n.id === noteId ? { ...n, content: newContent } : n
    ));
  };

  // --- Stacking Logic ---
  const handleNoteDrop = async (sourceId: string, targetId: string) => {
    const sourceIndex = notes.findIndex(n => n.id === sourceId);
    const targetIndex = notes.findIndex(n => n.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const sourceNote = notes[sourceIndex];
    const targetNote = notes[targetIndex];
    let newNotes = [...notes];
    let updatedStack: Note;
    let itemsForAI: Note[] = [];

    if (targetNote.type === NoteType.STACK) {
      const existingItems = targetNote.stackItems || [];
      const newItems = sourceNote.type === NoteType.STACK
        ? [...(sourceNote.stackItems || []), ...existingItems]
        : [sourceNote, ...existingItems];

      updatedStack = { ...targetNote, stackItems: newItems };
      itemsForAI = newItems;

      newNotes.splice(sourceIndex, 1);
      const newTargetIndex = newNotes.findIndex(n => n.id === targetId);
      newNotes[newTargetIndex] = updatedStack;
    } else {
      const items = [sourceNote, targetNote];
      itemsForAI = items;
      const stackId = generateId();
      updatedStack = {
        id: stackId,
        content: "正在生成标题...",
        createdAt: Date.now(),
        type: NoteType.STACK,
        isProcessing: false,
        stackItems: items,
        stackCategory: StackCategory.GENERAL,
        analysis: { category: targetNote.analysis?.category || '组合', tags: ['CardStack'], sentiment: '中性' }
      };

      newNotes = newNotes.filter(n => n.id !== sourceId && n.id !== targetId);
      newNotes.splice(Math.min(sourceIndex, targetIndex), 0, updatedStack);
    }

    setNotes(newNotes);

    Promise.all([
      generateStackTitle(itemsForAI),
      determineStackCategory(itemsForAI)
    ]).then(([title, category]) => {
      setNotes(currentNotes => currentNotes.map(n =>
        n.id === updatedStack.id ? { ...n, title: title, stackCategory: category } : n
      ));
    });
  };

  const handleStackCategoryChange = (noteId: string, newCategory: StackCategory) => {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, stackCategory: newCategory } : n));
    if (selectedStack && selectedStack.id === noteId) {
      setSelectedStack(prev => prev ? { ...prev, stackCategory: newCategory } : null);
    }
  };

  const handleRemoveFromStack = (noteId: string) => {
    if (!selectedStack) return;
    const noteToRemove = selectedStack.stackItems?.find(n => n.id === noteId);
    if (!noteToRemove) return;

    const updatedItems = selectedStack.stackItems?.filter(n => n.id !== noteId) || [];
    let updatedNotes = [...notes];

    if (updatedItems.length === 0) {
      updatedNotes = updatedNotes.filter(n => n.id !== selectedStack.id);
    } else if (updatedItems.length === 1) {
      const remainingNote = updatedItems[0];
      const stackIndex = updatedNotes.findIndex(n => n.id === selectedStack.id);
      updatedNotes[stackIndex] = remainingNote;
      setSelectedStack(null);
    } else {
      const updatedStack = { ...selectedStack, stackItems: updatedItems };
      const stackIndex = updatedNotes.findIndex(n => n.id === selectedStack.id);
      updatedNotes[stackIndex] = updatedStack;
      setSelectedStack(updatedStack);
    }

    updatedNotes.unshift(noteToRemove);
    setNotes(updatedNotes);
  };

  /**
   * Converts a list of loose notes (e.g. from Inbox) into a formal Stack.
   * Returns the new Stack ID.
   */
  const handleCreateStackFromNotes = async (sourceNotes: Note[]): Promise<string> => {
    const stackId = generateId();
    const stackTitle = `Inbox Generated ${new Date().toLocaleDateString()}`;

    // Create the new stack note
    const newStack: Note = {
      id: stackId,
      title: stackTitle,
      content: stackTitle,
      createdAt: Date.now(),
      type: NoteType.STACK,
      isProcessing: false,
      stackItems: sourceNotes,
      stackCategory: StackCategory.GENERAL,
      analysis: { category: 'Inbox', tags: ['Generated'], sentiment: '中性' }
    };

    // Remove source notes from top-level list and add the new stack
    const sourceIds = new Set(sourceNotes.map(n => n.id));
    setNotes(prev => [newStack, ...prev.filter(n => !sourceIds.has(n.id))]);

    // Async optimize title and category
    Promise.all([
      generateStackTitle(sourceNotes),
      determineStackCategory(sourceNotes)
    ]).then(([title, category]) => {
      setNotes(currentNotes => currentNotes.map(n =>
        n.id === stackId ? { ...n, title: title, stackCategory: category } : n
      ));
    });

    return stackId;
  };

  // --- Chart Data Preparation ---
  const getCategoryData = (): CategoryData[] => {
    const data: Record<string, number> = {};
    notes.forEach(note => {
      const cat = note.type === NoteType.STACK ? (note.stackCategory || '未分类') : (note.analysis?.category || '未分类');
      data[cat] = (data[cat] || 0) + 1;
    });

    const COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#64748b'];

    return Object.keys(data).map((name, index) => ({
      name,
      value: data[name],
      fill: COLORS[index % COLORS.length]
    }));
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">

      {/* 1. LEFT SIDEBAR */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col z-20 shadow-sm relative">
        <div className="h-16 flex items-center px-6 border-b border-slate-100">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center mr-3 shadow-lg shadow-purple-500/20">
            <span className="text-white font-bold text-lg">G</span>
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-800">GrowthLoop</span>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setView('capture')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
              ${view === 'capture'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <PenTool className="w-4 h-4" />
            捕捉 (Capture)
          </button>
          <button
            onClick={() => setView('insights')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
              ${view === 'insights'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <Sparkles className="w-4 h-4" />
            洞察 (Insights)
          </button>
          <button
            onClick={() => setView('architect')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
              ${view === 'architect'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <Layout className="w-4 h-4" />
            文章架构师 (Architect)
          </button>
          <button
            onClick={() => setView('plato')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
              ${view === 'plato'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            Plato 测试
          </button>

        </nav>

        <div className="p-4 border-t border-slate-50">
          <div className="bg-slate-50 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3 tracking-wider">Storage</h4>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2">
              <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: '35%' }}></div>
            </div>
            <p className="text-xs text-slate-500">{notes.length} 条笔记</p>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative overflow-hidden">

        {view === 'capture' && (
          <div className="h-full flex flex-col">
            {/* Header */}
            <header className="h-16 flex items-center justify-between px-8 bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-slate-100">
               <h2 className="text-lg font-bold text-slate-800">今日捕捉</h2>
               <div className="flex items-center gap-2">
                 <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                   {new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}
                 </span>
               </div>
            </header>

            {/* Input Area */}
            <div className="px-8 pt-8 pb-4">
              <div className="max-w-3xl mx-auto">
                 <NoteInput onSave={handleSaveNote} isSaving={isProcessing} />
              </div>
            </div>

            {/* Waterfall Stream */}
            <div className="flex-1 overflow-y-auto px-8 pb-20 no-scrollbar">
              <div className="max-w-5xl mx-auto">
                <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
                  {notes.map(note => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      onClick={(n) => n.type === NoteType.STACK && setSelectedStack(n)}
                      onDrop={handleNoteDrop}
                      onCategoryChange={handleStackCategoryChange}
                      onUpdate={handleUpdateNote}
                    />
                  ))}

                  {notes.length === 0 && (
                     <div className="col-span-full py-20 text-center">
                       <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                         <PenTool className="w-6 h-6 text-slate-300" />
                       </div>
                       <p className="text-slate-400 font-medium">这里还很空，开始记录你的想法吧...</p>
                     </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'insights' && (
          <div className="h-full">
            <InsightGenerator
              notes={notes}
              history={insightHistory}
              onSaveToHistory={handleSaveToHistory}
              onOpenWorkbench={handleOpenWorkbench}
            />
          </div>
        )}


        {view === 'plato' && (
          <div className="h-full">
            <PlatoTest />
          </div>
        )}

        {view === 'architect' && (
          <div className="h-full flex flex-col">
            <ArticleArchitect
              allNotes={notes}
              history={insightHistory}
              onSaveToHistory={handleSaveToHistory}
              onCreateStack={handleCreateStackFromNotes}
              onUpdateHistory={handleUpdateHistory}
            />
          </div>
        )}

      </main>

      {/* 3. RIGHT SIDEBAR (STATS) - Only visible in capture mode for cleaner UI */}
      {view === 'capture' && (
        <aside className="w-80 bg-white border-l border-slate-100 flex-col max-xl:hidden xl:flex z-10">
           <div className="h-16 flex items-center px-6 border-b border-slate-50">
             <h3 className="font-bold text-slate-800">数据概览</h3>
           </div>

           <div className="p-6 flex-1 overflow-y-auto">
              {/* Chart */}
              <div className="mb-10">
                <h4 className="text-sm font-semibold text-slate-500 mb-6">内容分布</h4>
                <div className="h-64 w-full relative">
                  {notes.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getCategoryData()}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {getCategoryData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={0} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-slate-300 text-sm bg-slate-50 rounded-2xl">
                      暂无数据
                    </div>
                  )}
                  {notes.length > 0 && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center -mt-4">
                      <span className="block text-3xl font-bold text-slate-800">{notes.length}</span>
                      <span className="text-xs text-slate-400 font-medium">Total</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Daily Quote */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-6 rounded-2xl border border-purple-100">
                 <h4 className="text-xs font-bold text-purple-600 uppercase mb-2 tracking-wide">Daily Wisdom</h4>
                 <p className="text-slate-700 italic font-serif leading-relaxed mb-3">
                   "Go to bed smarter than when you woke up."
                 </p>
                 <div className="flex items-center gap-2">
                   <div className="w-6 h-6 bg-purple-200 rounded-full flex items-center justify-center text-[10px] font-bold text-purple-700">C</div>
                   <span className="text-xs text-slate-500 font-medium">Charlie Munger</span>
                 </div>
              </div>
           </div>
        </aside>
      )}

      {/* Modals */}
      {selectedStack && (
        <StackDetailModal
          stack={selectedStack}
          onClose={() => setSelectedStack(null)}
          onRemoveItem={handleRemoveFromStack}
          onSaveToHistory={handleSaveToHistory}
        />
      )}
    </div>
  );
};

export default App;