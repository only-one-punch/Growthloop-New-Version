
import React, { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, Send, X, Loader2 } from 'lucide-react';

interface NoteInputProps {
  onSave: (content: string, imageBase64?: string) => void;
  isSaving: boolean;
}

const NoteInput: React.FC<NoteInputProps> = ({ onSave, isSaving }) => {
  const [content, setContent] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setIsExpanded(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (!content.trim() && !image) return;
    onSave(content, image || undefined);
    setContent('');
    setImage(null);
    setIsExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  };

  return (
    <div className={`
      bg-white rounded-2xl shadow-lg border border-slate-100 mx-auto transition-all duration-300 overflow-hidden
      ${isExpanded ? 'w-full p-6 ring-4 ring-slate-50' : 'w-full h-14 flex items-center px-6 hover:shadow-xl cursor-text'}
    `}>
      {!isExpanded ? (
        <div 
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center justify-between text-slate-400 font-medium"
        >
          <span>捕捉一个想法...</span>
          <ImageIcon className="w-5 h-5 hover:text-slate-600 transition-colors" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {image && (
            <div className="relative w-fit group">
              <img src={image} alt="Preview" className="h-40 w-auto rounded-lg object-cover border border-slate-100 shadow-sm" />
              <button 
                onClick={() => setImage(null)}
                className="absolute -top-2 -right-2 bg-white rounded-full p-1.5 shadow-md border border-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的洞察，粘贴代码，或拖入图片..."
            className="w-full resize-none outline-none text-slate-700 placeholder:text-slate-300 min-h-[100px] text-lg leading-relaxed"
            autoFocus
          />

          <div className="flex items-center justify-between pt-4 border-t border-slate-50">
            <div className="flex gap-2">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-purple-600 transition-colors"
                title="添加图片"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleImageUpload}
              />
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsExpanded(false)}
                className="text-sm font-medium text-slate-400 hover:text-slate-600 px-4 py-2 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || (!content.trim() && !image)}
                className={`
                  flex items-center gap-2 px-6 py-2 rounded-full font-medium text-sm transition-all shadow-md hover:shadow-lg
                  ${(!content.trim() && !image) 
                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed' 
                    : 'bg-slate-900 text-white hover:bg-slate-800'}
                `}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    处理中
                  </>
                ) : (
                  <>
                    保存 <span className="opacity-50 text-xs ml-1">⌘↵</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NoteInput;
