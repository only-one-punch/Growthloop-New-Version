import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Note } from '../types';
import { X, FileText, Calendar, Tag } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

interface NoteDetailModalProps {
  note: Note;
  onClose: () => void;
  onUpdate?: (noteId: string, newContent: string) => void;
  onDelete?: (noteId: string) => void;
}

const NoteDetailModal: React.FC<NoteDetailModalProps> = ({ note, onClose, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editText, setEditText] = React.useState(note.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(note.id, editText || '');
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (onDelete) {
      onDelete(note.id);
      onClose();
    }
    setShowDeleteConfirm(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-4">
            <div className="bg-slate-100 p-2.5 rounded-xl text-slate-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-slate-800">笔记详情</h3>
              <div className="flex items-center gap-3 text-sm text-slate-500 font-medium mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(note.createdAt).toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
                {note.analysis?.category && (
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" />
                    {note.analysis.category}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {/* Image */}
          {note.imageBase64 && (
            <div className="mb-6 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
              <img
                src={note.imageBase64}
                alt="Attachment"
                className="w-full h-auto object-contain max-h-80"
              />
            </div>
          )}

          {/* Text Content */}
          {isEditing ? (
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full min-h-[300px] p-4 text-base border border-slate-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white font-mono"
              autoFocus
            />
          ) : (
            <div
              className="prose prose-slate max-w-none cursor-text
                prose-headings:text-slate-800 prose-headings:font-bold
                prose-h1:text-2xl prose-h1:border-b prose-h1:border-slate-200 prose-h1:pb-2 prose-h1:mt-0
                prose-h2:text-xl prose-h2:mt-6 first:prose-h2:mt-0
                prose-p:text-slate-700 prose-p:leading-relaxed prose-p:my-3
                prose-strong:text-slate-800 prose-strong:font-semibold
                prose-blockquote:border-l-4 prose-blockquote:border-purple-300 prose-blockquote:bg-purple-50 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:text-slate-600 prose-blockquote:my-3
                prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
                prose-pre:bg-slate-800 prose-pre:text-slate-100 prose-pre:rounded-xl
                prose-ul:list-disc prose-ol:list-decimal
                prose-li:text-slate-700
                [&>*:first-child]:mt-0"
              onClick={() => setIsEditing(true)}
            >
              {note.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {note.content}
                </ReactMarkdown>
              ) : (
                <span className="text-slate-400 italic">无文本内容</span>
              )}
            </div>
          )}

          {/* Tags */}
          {note.analysis?.tags && note.analysis.tags.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <div className="flex flex-wrap gap-2">
                {note.analysis.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-white flex justify-between items-center">
          <button
            onClick={handleDelete}
            className="text-red-500 hover:text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            删除笔记
          </button>

          <div className="flex gap-3">
            {isEditing ? (
              <>
                <button
                  onClick={() => { setEditText(note.content); setIsEditing(false); }}
                  className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-purple-200 transition-all"
                >
                  保存
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-2 rounded-lg font-medium transition-colors"
              >
                编辑
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="删除笔记"
        message="确定要删除这条笔记吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

export default NoteDetailModal;
