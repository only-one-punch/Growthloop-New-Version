import React, { useState } from 'react';
import { chatCompletion, imagesGenerate, ModelRegistry } from '../services/platoClient';

const PlatoTest: React.FC = () => {
  const [prompt, setPrompt] = useState('你好，请用一句话介绍 GrowthLoop');
  const [model, setModel] = useState<string>(ModelRegistry.DEFAULT);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const [imagePrompt, setImagePrompt] = useState('A minimalist logo for a startup named "GrowthLoop"');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageLoading, setImageLoading] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    setResult('');
    const text = await chatCompletion([
      { role: 'user', content: prompt }
    ], { model, temperature });
    setResult(text);
    setLoading(false);
  };

  const handleImageGenerate = async () => {
    setImageLoading(true);
    setImageUrl('');
    const url = await imagesGenerate(imagePrompt);
    if (url) {
      setImageUrl(url);
    } else {
      setImageUrl('//error'); // Simple error indicator
    }
    setImageLoading(false);
  };

  return (
    <div className="h-full flex flex-col">
      <header className="h-16 flex items-center justify-between px-8 bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-slate-100">
        <h2 className="text-lg font-bold text-slate-800">Plato 测试</h2>
        <div className="text-xs text-slate-500">BASE_URL: {import.meta.env.VITE_PLATO_BASE_URL || '未配置'} · MODEL: {ModelRegistry.DEFAULT}</div>
      </header>

      <div className="p-8 max-w-3xl w-full mx-auto space-y-4 divide-y divide-slate-200">
        {/* Chat Completion Test */}
        <div className="py-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-800">文本生成测试</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <label className="text-sm text-slate-600">模型</label>
            <input
              className="md:col-span-2 w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="如 claude"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <label className="text-sm text-slate-600">Temperature</label>
            <input
              type="number"
              step="0.1"
              min={0}
              max={1}
              className="md:col-span-2 w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </div>
          <div>
            <textarea
              className="w-full h-24 p-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSend}
              disabled={loading}
              className={`px-4 py-2 rounded-lg text-white text-sm font-medium ${loading ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'}`}>
              {loading ? '调用中...' : '发送调用'}
            </button>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">返回结果</h4>
            <pre className="whitespace-pre-wrap bg-slate-50 p-4 rounded-xl border border-slate-100 text-slate-800 min-h-24">
              {result || '（空）'}
            </pre>
          </div>
        </div>

        {/* Image Generation Test */}
        <div className="py-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-800">图片生成测试</h3>
          <div>
            <textarea
              className="w-full h-24 p-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleImageGenerate}
              disabled={imageLoading}
              className={`px-4 py-2 rounded-lg text-white text-sm font-medium ${imageLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-500'}`}>
              {imageLoading ? '生成中...' : '生成图片'}
            </button>
          </div>
          {imageUrl && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">图片结果</h4>
              {imageUrl === '//error' ? (
                <p className="text-red-500">图片生成失败。</p>
              ) : (
                <img src={imageUrl} alt="Generated image" className="max-w-sm rounded-lg border border-slate-200" />
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default PlatoTest;

