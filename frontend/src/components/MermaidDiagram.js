import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { AlertCircle, Copy, Check, ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';
import toast from 'react-hot-toast';

const MermaidDiagram = ({ code }) => {
  const [diagramId] = useState(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mermaidInitialized, setMermaidInitialized] = useState(false);
  const containerRef = useRef(null);
  const diagramRef = useRef(null);
  const copyTimeoutRef = useRef(null);

  // 使用useRef来保存事件处理函数的引用
  const handleMouseMoveRef = useRef(null);
  const handleMouseUpRef = useRef(null);

  // 安全的状态更新函数
  const safeSetState = useCallback((setter, value) => {
    try {
      setter(value);
    } catch (error) {
      console.warn('状态更新失败:', error);
    }
  }, []);

  // 安全的DOM操作函数
  const safeDOMOperation = useCallback((operation) => {
    if (containerRef.current) {
      try {
        return operation();
      } catch (error) {
        console.warn('DOM operation failed:', error);
        return false;
      }
    }
    return false;
  }, []);

  // 缩放控制函数
  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev * 1.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev / 1.2, 0.3));
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // 鼠标滚轮缩放
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.3, Math.min(3, prev * delta)));
  }, []);

  // 拖拽开始
  const handleMouseDown = useCallback((e) => {
    if (e.button === 0) { // 左键
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  }, [position]);

  // 创建事件处理函数
  useEffect(() => {
    handleMouseMoveRef.current = (e) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        });
      }
    };

    handleMouseUpRef.current = () => {
      setIsDragging(false);
    };
  }, [isDragging, dragStart]);

  // 管理事件监听器
  useEffect(() => {
    // 使用局部变量存储事件处理函数的引用，避免闭包问题
    let localHandleMouseMove = null;
    let localHandleMouseUp = null;
    
    const handleMouseMove = (e) => {
      if (handleMouseMoveRef.current) {
        handleMouseMoveRef.current(e);
      }
    };

    const handleMouseUp = () => {
      if (handleMouseUpRef.current) {
        handleMouseUpRef.current();
      }
    };

    if (isDragging) {
      // 使用window.document确保获取全局document对象，并检查addEventListener方法是否存在
      const globalDocument = window.document;
      if (globalDocument && typeof globalDocument.addEventListener === 'function') {
        localHandleMouseMove = handleMouseMove;
        localHandleMouseUp = handleMouseUp;
        
        globalDocument.addEventListener('mousemove', localHandleMouseMove, { passive: false });
        globalDocument.addEventListener('mouseup', localHandleMouseUp, { passive: false });
      }
    }

    // 清理函数 - 添加多重安全检查
    return () => {
      try {
        // 使用window.document确保获取全局document对象
        const globalDocument = window.document;
        if (globalDocument && typeof globalDocument.removeEventListener === 'function') {
          if (localHandleMouseMove) {
            globalDocument.removeEventListener('mousemove', localHandleMouseMove);
          }
          if (localHandleMouseUp) {
            globalDocument.removeEventListener('mouseup', localHandleMouseUp);
          }
        }
      } catch (error) {
        // 静默处理清理错误，避免影响应用运行
        console.warn('清理事件监听器时出错:', error);
      }
    };
  }, [isDragging]);

  // 渲染图表
  const renderDiagram = useCallback(async () => {
    if (!code || isRendering) return;

    console.log('开始渲染Mermaid图表...');
    console.log('代码预览:', code.substring(0, 100) + (code.length > 100 ? '...' : ''));

    safeSetState(setIsRendering, true);
    safeSetState(setError, null);
    safeSetState(setHasRendered, false);

    // 设置超时
    const timeoutId = setTimeout(() => {
      console.error('渲染超时，强制停止');
      safeSetState(setIsRendering, false);
      safeSetState(setError, '渲染超时，请重试');
    }, 15000); // 15秒超时

    try {
      // 初始化Mermaid配置（只初始化一次）
      if (!mermaidInitialized) {
        console.log('初始化Mermaid配置...');
        mermaid.initialize({ 
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
          logLevel: 'error',
          flowchart: {
            useMaxWidth: false,
            htmlLabels: true,
            curve: 'basis'
          },
          mindmap: {
            useMaxWidth: false,
            padding: 20
          }
        });
        setMermaidInitialized(true);
        console.log('Mermaid初始化完成');
      }

      // 清空容器
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        console.log('容器已清空');
      }

      // 检查语法（可选，如果失败就跳过）
      try {
        console.log('检查语法...');
        await mermaid.parse(code);
        console.log('语法检查通过');
      } catch (parseError) {
        console.warn('语法检查失败，尝试直接渲染:', parseError.message);
      }

      // 渲染图表
      console.log('开始渲染图表...');
      const renderResult = await mermaid.render(diagramId, code);
      console.log('渲染完成，结果:', renderResult ? '有数据' : '无数据');
      
      // 检查组件是否仍然存在（不使用isMountedRef）
      if (!containerRef.current) {
        console.log('容器不存在，停止渲染');
        return;
      }

      if (renderResult && renderResult.svg) {
        console.log('处理SVG结果...');
        // 直接插入SVG，避免复杂的DOM操作
        containerRef.current.innerHTML = renderResult.svg;
        
        const svgElement = containerRef.current.querySelector('svg');
        if (svgElement) {
          console.log('SVG元素找到，设置样式...');
          // 设置SVG样式
          svgElement.style.maxWidth = 'none';
          svgElement.style.height = 'auto';
          svgElement.style.userSelect = 'none';
          svgElement.style.cursor = isDragging ? 'grabbing' : 'grab';
          svgElement.style.display = 'block';
          
          console.log('SVG已插入DOM');
          safeSetState(setHasRendered, true);
        } else {
          console.log('SVG元素未找到');
          throw new Error('SVG元素未找到');
        }
      } else {
        throw new Error('渲染结果为空');
      }

    } catch (error) {
      console.error('主渲染方法失败:', error);
      
      // 如果标准方法失败，尝试fallback方法
      if (containerRef.current) {
        try {
          console.log('尝试fallback渲染方法...');
          
          // 使用回调方式渲染
          const fallbackPromise = new Promise((resolve, reject) => {
            const fallbackTimeout = setTimeout(() => {
              reject(new Error('Fallback渲染超时'));
            }, 10000);

            mermaid.mermaidAPI.render(
              diagramId + '_fallback',
              code,
              (svg) => {
                clearTimeout(fallbackTimeout);
                if (containerRef.current && svg) {
                  console.log('Fallback渲染成功');
                  containerRef.current.innerHTML = svg;
                  
                  const svgElement = containerRef.current.querySelector('svg');
                  if (svgElement) {
                    svgElement.style.maxWidth = 'none';
                    svgElement.style.height = 'auto';
                    svgElement.style.userSelect = 'none';
                    svgElement.style.cursor = isDragging ? 'grabbing' : 'grab';
                  }
                  
                  safeSetState(setHasRendered, true);
                  resolve(svg);
                } else {
                  reject(new Error('Fallback结果为空'));
                }
              },
              containerRef.current
            );
          });

          await fallbackPromise;
        } catch (fallbackError) {
          console.error('Fallback渲染也失败:', fallbackError);
          safeSetState(setError, fallbackError.message || error.message || '图表渲染失败');
        }
      }
    } finally {
      clearTimeout(timeoutId);
      console.log('渲染流程结束');
      safeSetState(setIsRendering, false);
    }
  }, [code, isRendering, diagramId, safeSetState, isDragging, mermaidInitialized]);

  // 监听代码变化重新渲染
  useEffect(() => {
    if (code && !isRendering) {
      // 延迟执行，确保DOM已准备好
      const timeoutId = setTimeout(() => {
        renderDiagram();
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [code]); // 只依赖code变化

  // 复制代码功能
  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      safeSetState(setCopied, true);
      toast.success('Mermaid代码已复制到剪贴板');
      
      // 清理之前的timeout
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      
      // 设置新的timeout
      copyTimeoutRef.current = setTimeout(() => safeSetState(setCopied, false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('复制失败，请手动复制');
    }
  }, [code, safeSetState]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  if (!code) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center text-gray-500">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p>暂无思维导图数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-gray-50 overflow-hidden">
      {/* 控制工具栏 */}
      <div className="absolute top-2 right-2 z-10 flex space-x-1 bg-white rounded-lg shadow-sm border p-1">
        <button
          onClick={handleZoomIn}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="放大"
        >
          <ZoomIn className="w-4 h-4 text-gray-600" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="缩小"
        >
          <ZoomOut className="w-4 h-4 text-gray-600" />
        </button>
        <button
          onClick={handleReset}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="重置视图"
        >
          <RotateCcw className="w-4 h-4 text-gray-600" />
        </button>
        <div className="w-px bg-gray-300 mx-1"></div>
        <button
          onClick={handleCopyCode}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="复制代码"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4 text-gray-600" />
          )}
        </button>
      </div>

      {/* 缩放比例显示 */}
      <div className="absolute bottom-2 right-2 z-10 bg-white rounded px-2 py-1 shadow-sm border text-xs text-gray-600">
        {Math.round(scale * 100)}%
      </div>

      {/* 拖拽提示 */}
      {!isDragging && hasRendered && (
        <div className="absolute bottom-2 left-2 z-10 bg-white rounded px-2 py-1 shadow-sm border text-xs text-gray-500 flex items-center">
          <Move className="w-3 h-3 mr-1" />
          拖拽移动 | 滚轮缩放
        </div>
      )}

      {/* 图表容器 */}
      <div 
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onWheel={handleWheel}
      >
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-75 z-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">正在渲染图表...</p>
            </div>
          </div>
        )}

        {error ? (
          <div className="text-center text-red-600 p-4">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p className="font-medium mb-1">渲染失败</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={renderDiagram}
              className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 transition-colors"
            >
              重试
            </button>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="transform-gpu transition-transform duration-200 ease-out"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
          />
        )}
      </div>
    </div>
  );
};

export default MermaidDiagram; 