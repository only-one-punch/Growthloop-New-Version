import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface ArticleRendererProps {
  content: string;
}

const ArticleRenderer: React.FC<ArticleRendererProps> = ({ content }) => {
  return (
    <div className="prose prose-slate max-w-none w-full h-full overflow-y-auto p-8 md:p-12 focus:outline-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {content}
        </ReactMarkdown>
    </div>
  );
};

export default ArticleRenderer;

