
import React, { useState, useEffect } from 'react';
import { PenTool, Sparkles, Layout, ChevronRight, FileText, LogOut } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Session } from '@supabase/supabase-js';

import NoteInput from './components/NoteInput';
import NoteCard from './components/NoteCard';
import InsightGenerator from './components/InsightGenerator';
import StackDetailModal from './components/StackDetailModal';
import NoteDetailModal from './components/NoteDetailModal';
import ConfirmDialog from './components/ConfirmDialog';
import ArticleArchitect from './components/HistoryWorkbench'; // Renamed import for clarity, though file is still HistoryWorkbench.tsx
import PlatoTest from './components/PlatoTest';
import Auth from './components/Auth';
import { analyzeNoteContent, generateStackTitle, determineStackCategory } from '@/services/geminiService';
import { supabase } from './services/supabaseClient';
import { Note, NoteType, CategoryData, InsightHistoryItem, StackCategory, InsightPlatform } from './types';



const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [insightHistory, setInsightHistory] = useState<InsightHistoryItem[]>([]);
  const [view, setView] = useState<'capture' | 'insights' | 'architect' | 'plato'>('capture');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedStack, setSelectedStack] = useState<Note | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, []);

  useEffect(() => {
    if (session) {
      getNotes();
      getInsightHistory();
    }
  }, [session]);

  const getNotes = async () => {
    try {
      const { data: allNotes, error } = await supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (allNotes) {
        const notesMap = new Map<string, Note>();
        allNotes.forEach(note => notesMap.set(note.id, { ...note, stackItems: [] }));

        const rootNotes: Note[] = [];
        allNotes.forEach(note => {
          if (note.parent_stack_id && notesMap.has(note.parent_stack_id)) {
            const parent = notesMap.get(note.parent_stack_id)!;
            parent.stackItems?.push(notesMap.get(note.id)!);
          } else {
            rootNotes.push(notesMap.get(note.id)!);
          }
        });

        setNotes(rootNotes);
      }
    } catch (error: any) {
      console.error('Error fetching notes:', error.message);
    }
  };

  const getInsightHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('insights')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setInsightHistory(data as InsightHistoryItem[]);
      }
    } catch (error: any) {
      console.error('Error fetching insight history:', error.message);
    }
  };

  const handleSaveNote = async (content: string, imageBase64?: string) => {
    if (!session) return;
    setIsProcessing(true);

    try {
      // 1. Analyze content first
      const analysis = await analyzeNoteContent(content, imageBase64);

      let imageUrl: string | undefined = undefined;

      // 2. Handle image upload if present
      if (imageBase64) {
        const filePath = `${session.user.id}/${new Date().getTime()}.png`;
        const imageFile = await (await fetch(imageBase64)).blob();

        const { error: uploadError } = await supabase.storage
          .from('notes-images') // Assuming a bucket named 'notes-images'
          .upload(filePath, imageFile, { contentType: 'image/png' });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('notes-images')
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
      }

      // 3. Prepare note object for DB
      const noteToInsert = {
        user_id: session.user.id,
        content,
        image_url: imageUrl,
        type: imageUrl ? (content ? NoteType.MIXED : NoteType.IMAGE) : NoteType.TEXT,
        analysis_category: analysis.category,
        analysis_tags: analysis.tags,
        analysis_sentiment: analysis.sentiment,
      };

      // 4. Insert into Supabase
      const { data, error } = await supabase
        .from('notes')
        .insert(noteToInsert)
        .select()
        .single();

      if (error) throw error;

      // 5. Update local state
      if (data) {
        setNotes(prev => [data as Note, ...prev]);
      }

    } catch (e: any) {
      console.error("Failed to save note:", e.message);
      alert('Error: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToHistory = async (item: Omit<InsightHistoryItem, 'id' | 'createdAt'>) => {
    if (!session) return;
    try {
      const insightToInsert = {
        ...item,
        user_id: session.user.id,
      };

      const { data, error } = await supabase
        .from('insights')
        .insert(insightToInsert)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setInsightHistory(prev => [data as InsightHistoryItem, ...prev]);
      }
    } catch (error: any) {
      console.error('Error saving insight:', error.message);
    }
  };

  const handleUpdateHistory = async (id: string, newContent: string) => {
    try {
      const { data, error } = await supabase
        .from('insights')
        .update({ content: newContent })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setInsightHistory(prev =>
          prev.map(item => (item.id === id ? (data as InsightHistoryItem) : item))
        );
      }
    } catch (error: any) {
      console.error('Error updating insight:', error.message);
    }
  };

    const handleOpenWorkbench = (_item: InsightHistoryItem) => {
    // For now, redirect to architect view. In a real app, we might pass the selected item ID to pre-select it.
    setView('architect');
  };

  const handleUpdateNote = async (noteId: string, newContent: string) => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .update({ content: newContent })
        .eq('id', noteId)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setNotes(prev => prev.map(n => (n.id === noteId ? (data as Note) : n)));
      }
    } catch (error: any) {
      console.error('Error updating note:', error.message);
    }
  };

  const handleDeleteNote = (noteId: string) => {
    setNoteToDelete(noteId);
  };

  const handleConfirmDelete = async () => {
    if (!noteToDelete) return;
    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteToDelete);

      if (error) throw error;

      setNotes(prev => prev.filter(note => note.id !== noteToDelete));
      setNoteToDelete(null);
    } catch (error: any) {
      console.error('Error deleting note:', error.message);
    }
  };


  // --- Stacking Logic ---
  const handleNoteDrop = async (sourceId: string, targetId: string) => {
    if (!session) return;

    const { data: targetNote } = await supabase.from('notes').select('*').eq('id', targetId).single();
    if (!targetNote) return;

    try {
      if (targetNote.type === NoteType.STACK) {
        // Case 1: Drop onto an existing stack
        const { error } = await supabase
          .from('notes')
          .update({ parent_stack_id: targetId })
          .eq('id', sourceId);
        if (error) throw error;
      } else {
        // Case 2: Drop onto a regular note to create a new stack
        const [title, category] = await Promise.all([
          generateStackTitle([/* Pass relevant notes info */]),
          determineStackCategory([/* Pass relevant notes info */])
        ]);

        const { data: newStack, error: stackError } = await supabase
          .from('notes')
          .insert({
            user_id: session.user.id,
            type: NoteType.STACK,
            title: title,
            stack_category: category,
            content: 'New Stack'
          })
          .select()
          .single();

        if (stackError) throw stackError;

        if (newStack) {
          const { error: updateError } = await supabase
            .from('notes')
            .update({ parent_stack_id: newStack.id })
            .in('id', [sourceId, targetId]);
          if (updateError) throw updateError;
        }
      }
      // Refresh data from DB
      await getNotes();
    } catch (error: any) {
      console.error('Error handling note drop:', error.message);
    }
  };

  const handleStackCategoryChange = async (noteId: string, newCategory: StackCategory) => {
    try {
      const { error } = await supabase
        .from('notes')
        .update({ stack_category: newCategory })
        .eq('id', noteId);
      if (error) throw error;
      await getNotes(); // Refresh
    } catch (error: any) {
      console.error('Error updating stack category:', error.message);
    }
  };

  const handleRemoveFromStack = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('notes')
        .update({ parent_stack_id: null })
        .eq('id', noteId);
      if (error) throw error;
      setSelectedStack(null); // Close modal
      await getNotes(); // Refresh
    } catch (error: any) {
      console.error('Error removing note from stack:', error.message);
    }
  };

  const handleCreateStackFromNotes = async (sourceNotes: Note[]): Promise<string> => {
    if (!session) return '';
    try {
      const [title, category] = await Promise.all([
        generateStackTitle(sourceNotes),
        determineStackCategory(sourceNotes)
      ]);

      const { data: newStack, error: stackError } = await supabase
        .from('notes')
        .insert({
          user_id: session.user.id,
          type: NoteType.STACK,
          title: title,
          stack_category: category,
          content: 'New Stack from Architect'
        })
        .select()
        .single();

      if (stackError) throw stackError;

      if (newStack) {
        const sourceIds = sourceNotes.map(n => n.id);
        const { error: updateError } = await supabase
          .from('notes')
          .update({ parent_stack_id: newStack.id })
          .in('id', sourceIds);
        if (updateError) throw updateError;

        await getNotes();
        return newStack.id;
      }
    } catch (error: any) {
      console.error('Error creating stack from notes:', error.message);
    }
    return '';
  };

  // --- Chart Data Preparation ---
  const getCategoryData = (): CategoryData[] => {
    const data: Record<string, number> = {};
    notes.forEach(note => {
      const cat = note.type === NoteType.STACK ? (note.stack_category || '未分类') : (note.analysis_category || '未分类');
      data[cat] = (data[cat] || 0) + 1;
    });

    const COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#64748b'];

    return Object.keys(data).map((name, index) => ({
      name,
      value: data[name],
      fill: COLORS[index % COLORS.length]
    }));
  };

  if (!session) {
    return <Auth />;
  }

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

          <button
            onClick={() => supabase.auth.signOut()}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900`}>
            <LogOut className="w-4 h-4" />
            Sign Out
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
                      onClick={(n) => {
                        if (n.type === NoteType.STACK) {
                          setSelectedStack(n);
                        } else {
                          setSelectedNote(n);
                        }
                      }}
                      onDrop={handleNoteDrop}
                      onCategoryChange={handleStackCategoryChange}
                      onUpdate={handleUpdateNote}
                      onDelete={handleDeleteNote}
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
                <div className="h-64 w-full relative" style={{ minHeight: 0 }}>
                  {notes.length > 0 ? (
                    <PieChart width={250} height={250}>
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

      {selectedNote && (
        <NoteDetailModal
          note={selectedNote}
          onClose={() => setSelectedNote(null)}
          onUpdate={(noteId, newContent) => {
            handleUpdateNote(noteId, newContent);
            setSelectedNote(prev => prev ? { ...prev, content: newContent } : null);
          }}
          onDelete={(noteId) => {
            handleDeleteNote(noteId);
            setSelectedNote(null);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!noteToDelete}
        title="删除笔记"
        message="确定要删除这条笔记吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setNoteToDelete(null)}
      />

    </div>
  );
};

export default App;