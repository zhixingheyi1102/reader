import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { AlertCircle, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const MermaidDiagram = ({ code }) => {
  const [diagramId] = useState(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  const containerRef = useRef(null);
  const isMountedRef = useRef(true); // 添加挂载状态追踪

  // 安全的状态更新函数
  const safeSetState = useCallback((setter, value) => {
    if (isMountedRef.current) {
      setter(value);
    }
  }, []);

  // 安全的DOM操作函数
  const safeDOMOperation = useCallback((operation) => {
    if (isMountedRef.current && containerRef.current) {
      try {
        return operation();
      } catch (error) {
        console.warn('DOM operation failed:', error);
        return false;
      }
    }
    return false;
  }, []);

  useEffect(() => {
    // 组件挂载时设置为true
    isMountedRef.current = true;
    
    // 初始化Mermaid配置
    console.log('初始化Mermaid配置...');
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'trebuchet ms, verdana, arial, sans-serif',
      fontSize: 14,
      logLevel: 'error', // 减少日志输出
      flowchart: {
        htmlLabels: true,
        curve: 'basis',
        useMaxWidth: true,
      },
      mindmap: {
        useMaxWidth: true,
        padding: 10,
        maxNodeSizeX: 200,
        maxNodeSizeY: 100,
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
    console.log('Mermaid配置完成');

    // 清理函数
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!code || !isMountedRef.current) return;

    const renderDiagram = async () => {
      // 检查组件是否仍然挂载
      if (!isMountedRef.current) return;

      try {
        safeSetState(setError, null);
        safeSetState(setIsRendering, true);
        safeSetState(setHasRendered, false);
        
        console.log('开始渲染Mermaid图表...');
        console.log('代码内容:', code);
        
        // 安全地清空容器
        safeDOMOperation(() => {
          if (containerRef.current) {
            // 使用更安全的方式清空内容
            while (containerRef.current.firstChild) {
              containerRef.current.removeChild(containerRef.current.firstChild);
            }
          }
        });

        // 再次检查组件是否仍然挂载
        if (!isMountedRef.current) return;

        // 检查代码是否为mindmap类型
        const isMindmap = code.trim().startsWith('mindmap');
        console.log('是否为mindmap类型:', isMindmap);

        // 验证语法（可选）
        try {
          const isValid = await mermaid.parse(code);
          console.log('语法验证结果:', isValid);
        } catch (parseError) {
          console.warn('语法验证失败，尝试直接渲染:', parseError);
        }

        // 再次检查组件是否仍然挂载
        if (!isMountedRef.current) return;

        // 渲染图表
        console.log('开始渲染，diagramId:', diagramId);
        
        try {
          const result = await mermaid.render(diagramId, code);
          console.log('渲染结果:', result);
          
          // 检查组件是否仍然挂载并且结果有效
          if (isMountedRef.current && containerRef.current && result && result.svg) {
            safeDOMOperation(() => {
              // 创建临时容器来安全地插入SVG
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = result.svg;
              const svgElement = tempDiv.querySelector('svg');
              
              if (svgElement && containerRef.current) {
                // 应用样式
                svgElement.style.width = '100%';
                svgElement.style.height = 'auto';
                svgElement.style.maxWidth = '100%';
                svgElement.style.display = 'block';
                svgElement.style.margin = '0 auto';
                
                // 安全地插入SVG
                containerRef.current.appendChild(svgElement);
                console.log('SVG元素已安全插入');
              }
            });
            
            console.log('图表渲染成功');
          } else if (!isMountedRef.current) {
            console.log('组件已卸载，跳过DOM操作');
            return;
          } else {
            throw new Error('渲染结果为空或无效');
          }
        } catch (renderError) {
          console.error('标准渲染方法失败，尝试fallback方法:', renderError);
          
          // 检查组件是否仍然挂载
          if (!isMountedRef.current) return;
          
          // Fallback: 尝试使用mermaid.mermaidAPI.render
          try {
            const fallbackResult = await new Promise((resolve, reject) => {
              // 添加超时机制
              const timeoutId = setTimeout(() => {
                reject(new Error('渲染超时'));
              }, 10000);
              
              mermaid.mermaidAPI.render(diagramId, code, (svg, bindFunctions) => {
                clearTimeout(timeoutId);
                resolve({ svg, bindFunctions });
              }, containerRef.current);
            });
            
            // 检查组件是否仍然挂载
            if (isMountedRef.current && containerRef.current && fallbackResult && fallbackResult.svg) {
              safeDOMOperation(() => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = fallbackResult.svg;
                const svgElement = tempDiv.querySelector('svg');
                
                if (svgElement && containerRef.current) {
                  containerRef.current.appendChild(svgElement);
                }
              });
              console.log('Fallback渲染成功');
            } else if (!isMountedRef.current) {
              console.log('组件已卸载，跳过fallback DOM操作');
              return;
            } else {
              throw new Error('Fallback渲染也失败了');
            }
          } catch (fallbackError) {
            console.error('Fallback渲染失败:', fallbackError);
            throw renderError;
          }
        }
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        console.error('错误详情:', err.message, err.stack);
        safeSetState(setError, err.message || '图表渲染失败');
      } finally {
        safeSetState(setIsRendering, false);
        safeSetState(setHasRendered, true);
      }
    };

    // 添加延迟以确保DOM准备就绪
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        renderDiagram();
      }
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [code, diagramId, safeSetState, safeDOMOperation]);

  // 组件卸载时的清理
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // 安全地清理DOM
      if (containerRef.current) {
        try {
          while (containerRef.current.firstChild) {
            containerRef.current.removeChild(containerRef.current.firstChild);
          }
        } catch (error) {
          console.warn('清理DOM时发生错误:', error);
        }
      }
    };
  }, []);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      safeSetState(setCopied, true);
      toast.success('Mermaid代码已复制到剪贴板');
      
      // 2秒后重置复制状态
      setTimeout(() => {
        safeSetState(setCopied, false);
      }, 2000);
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
          {isRendering && !hasRendered && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-500">正在渲染图表...</p>
            </div>
          )}
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