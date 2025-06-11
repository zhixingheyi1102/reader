import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { AlertCircle, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const MermaidDiagram = ({ code }) => {
  const [diagramId] = useState(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    // 初始化Mermaid配置
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'trebuchet ms, verdana, arial, sans-serif',
      fontSize: 14,
      flowchart: {
        htmlLabels: true,
        curve: 'basis',
        useMaxWidth: true,
      },
      mindmap: {
        useMaxWidth: true,
        padding: 10,
      },
      themeVariables: {
        primaryColor: '#3b82f6',
        primaryTextColor: '#1f2937',
        primaryBorderColor: '#2563eb',
        lineColor: '#6b7280',
        secondaryColor: '#f3f4f6',
        tertiaryColor: '#e5e7eb',
        backgroundColorPrimary: '#ffffff',
        backgroundColorSecondary: '#f9fafb',
        backgroundColorTertiary: '#ffffff',
        mainBkg: '#ffffff',
        secondBkg: '#f3f4f6',
        tertiaryBkg: '#e5e7eb',
      },
    });
  }, []);

  useEffect(() => {
    if (!code || !containerRef.current) return;

    const renderDiagram = async () => {
      try {
        setError(null);
        
        // 清空容器
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        // 验证Mermaid语法
        const isValid = await mermaid.parse(code);
        if (!isValid) {
          throw new Error('Invalid Mermaid syntax');
        }

        // 渲染图表
        const { svg } = await mermaid.render(diagramId, code);
        
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          
          // 添加响应式样式
          const svgElement = containerRef.current.querySelector('svg');
          if (svgElement) {
            svgElement.style.width = '100%';
            svgElement.style.height = 'auto';
            svgElement.style.maxWidth = '100%';
            svgElement.style.display = 'block';
            svgElement.style.margin = '0 auto';
          }
        }
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(err.message || '图表渲染失败');
      }
    };

    renderDiagram();
  }, [code, diagramId]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Mermaid代码已复制到剪贴板');
      
      // 2秒后重置复制状态
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
      toast.error('复制失败，请手动选择代码');
    }
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">图表渲染失败</h3>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <details className="text-left">
            <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
              查看原始代码
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-32">
              {code}
            </pre>
          </details>
        </div>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">暂无思维导图数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="flex-shrink-0 px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Mermaid 图表
        </div>
        <button
          onClick={handleCopyCode}
          className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
          title="复制Mermaid代码"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 mr-1" />
              已复制
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              复制代码
            </>
          )}
        </button>
      </div>

      {/* 图表容器 */}
      <div className="flex-1 overflow-auto p-4">
        <div 
          ref={containerRef}
          className="w-full h-full flex items-center justify-center"
          style={{ minHeight: '200px' }}
        >
          {/* 加载中的占位符 */}
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">正在渲染图表...</p>
          </div>
        </div>
      </div>

      {/* 代码预览区域 */}
      <div className="flex-shrink-0 border-t bg-gray-50">
        <details className="group">
          <summary className="px-4 py-2 cursor-pointer text-xs text-gray-600 hover:text-gray-900 flex items-center justify-between">
            <span>查看原始代码</span>
            <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-4 pb-4">
            <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-32 text-gray-800">
              {code}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
};

export default MermaidDiagram; 