import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { ArrowLeft, Download, ExternalLink, RefreshCw, Play, Clock, CheckCircle, XCircle, Zap, BarChart3, FileText, File } from 'lucide-react';
import axios from 'axios';
import MermaidDiagram from './MermaidDiagram';

const ViewerPage = () => {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mindmapStatus, setMindmapStatus] = useState('not_started');
  const [mindmapError, setMindmapError] = useState(null);
  const [simpleMindmapStatus, setSimpleMindmapStatus] = useState('not_started');
  const [simpleMindmapError, setSimpleMindmapError] = useState(null);
  
  // 从上传页面传递的模式选择
  const selectedMode = location.state?.selectedMode || 'simple';
  const [currentMindmapMode, setCurrentMindmapMode] = useState(selectedMode);
  const [autoStarted, setAutoStarted] = useState(false);
  
  // 新增：文档查看模式 - 'markdown' 或 'pdf'
  const [viewMode, setViewMode] = useState('markdown');
  const [isPdfFile, setIsPdfFile] = useState(false);

  // 分割面板相关状态
  const [leftPanelWidth, setLeftPanelWidth] = useState(67); // 百分比
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  // 使用useRef来保存事件处理函数的引用
  const handleMouseMoveRef = useRef(null);
  const handleMouseUpRef = useRef(null);

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  // 文档加载完成后自动开始生成思维导图（只运行一次）
  useEffect(() => {
    if (document && !autoStarted) {
      setAutoStarted(true);
      setTimeout(() => {
        startMindmapGeneration(selectedMode);
      }, 1000);
    }
  }, [document, autoStarted, selectedMode]);

  // 轮询检查思维导图生成状态
  useEffect(() => {
    let interval;
    if (mindmapStatus === 'generating' || simpleMindmapStatus === 'generating') {
      interval = setInterval(async () => {
        try {
          const response = await axios.get(`http://localhost:8000/api/document-status/${documentId}`);
          if (response.data.success) {
            // 检查标准模式
            if (mindmapStatus === 'generating') {
              if (response.data.status === 'completed' && response.data.mermaid_code) {
                setMindmapStatus('completed');
                setDocument(prev => ({
                  ...prev,
                  mermaid_code: response.data.mermaid_code
                }));
                toast.success('详细思维导图生成完成！');
              } else if (response.data.status === 'error') {
                setMindmapStatus('error');
                setMindmapError(response.data.error || '生成失败');
                toast.error('详细思维导图生成失败');
              }
            }
            
            // 检查简化模式
            if (simpleMindmapStatus === 'generating') {
              if (response.data.status_simple === 'completed' && response.data.mermaid_code_simple) {
                setSimpleMindmapStatus('completed');
                setDocument(prev => ({
                  ...prev,
                  mermaid_code_simple: response.data.mermaid_code_simple
                }));
                toast.success('快速思维导图生成完成！');
              } else if (response.data.status_simple === 'error') {
                setSimpleMindmapStatus('error');
                setSimpleMindmapError(response.data.error_simple || '生成失败');
                toast.error('快速思维导图生成失败');
              }
            }
          }
        } catch (error) {
          console.error('Status polling error:', error);
        }
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mindmapStatus, simpleMindmapStatus, documentId]);

  // 拖拽处理函数
  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    e.preventDefault();
  }, []);

  // 创建事件处理函数
  useEffect(() => {
    handleMouseMoveRef.current = (e) => {
      if (!isDragging || !containerRef.current) return;
      
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;
      
      const newLeftWidth = (mouseX / containerWidth) * 100;
      const minWidth = 20;
      const maxWidth = 80;
      
      if (newLeftWidth >= minWidth && newLeftWidth <= maxWidth) {
        setLeftPanelWidth(newLeftWidth);
      }
    };

    handleMouseUpRef.current = () => {
      setIsDragging(false);
    };
  }, [isDragging]);

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
        
        if (globalDocument.body) {
          globalDocument.body.style.cursor = 'col-resize';
          globalDocument.body.style.userSelect = 'none';
        }
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
        
        // 重置样式
        if (globalDocument && globalDocument.body) {
          globalDocument.body.style.cursor = '';
          globalDocument.body.style.userSelect = '';
        }
      } catch (error) {
        // 静默处理清理错误，避免影响应用运行
        console.warn('清理事件监听器时出错:', error);
      }
    };
  }, [isDragging]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const statusResponse = await axios.get(`http://localhost:8000/api/document-status/${documentId}`);
      
      if (statusResponse.data.success) {
        const docData = statusResponse.data;
        setDocument({
          document_id: docData.document_id,
          content: docData.content,
          mermaid_code: docData.mermaid_code,
          mermaid_code_simple: docData.mermaid_code_simple,
          filename: docData.filename,
          file_type: docData.file_type,
          pdf_base64: docData.pdf_base64,
        });
        
        // 检查是否为PDF文件
        const isPDF = docData.file_type === '.pdf';
        setIsPdfFile(isPDF);
        
        // 如果是PDF文件，默认显示转换后的Markdown
        if (isPDF) {
          setViewMode('markdown');
        }
        
        // 设置思维导图状态
        setMindmapStatus(docData.status);
        setSimpleMindmapStatus(docData.status_simple || 'not_started');
        
        // 不在这里自动开始生成，避免双重触发
      } else {
        const response = await axios.get(`http://localhost:8000/api/document/${documentId}`);
        
        if (response.data.success) {
          setDocument(response.data);
          setMindmapStatus('completed');
        } else {
          setError('加载文档失败');
        }
      }
    } catch (error) {
      console.error('Load document error:', error);
      const errorMessage = error.response?.data?.detail || '加载文档失败，请检查网络连接';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const startMindmapGeneration = async (method = 'standard') => {
    try {
      const setStatus = method === 'simple' ? setSimpleMindmapStatus : setMindmapStatus;
      const setError = method === 'simple' ? setSimpleMindmapError : setMindmapError;
      
      setStatus('generating');
      setError(null);
      setCurrentMindmapMode(method);
      
      const url = method === 'simple' 
        ? `http://localhost:8000/api/generate-mindmap-simple/${documentId}`
        : `http://localhost:8000/api/generate-mindmap/${documentId}`;
      
      const response = await axios.post(url);
      
      if (response.data.success) {
        const modeText = method === 'simple' ? '快速' : '详细';
        toast.success(`开始生成${modeText}思维导图...`);
        
        if (response.data.status === 'completed' && response.data.mermaid_code) {
          setStatus('completed');
          const codeKey = method === 'simple' ? 'mermaid_code_simple' : 'mermaid_code';
          setDocument(prev => ({
            ...prev,
            [codeKey]: response.data.mermaid_code
          }));
          toast.success(`${modeText}思维导图生成完成！`);
        }
      } else {
        throw new Error(response.data.message || '开始生成失败');
      }
    } catch (error) {
      console.error(`Start ${method} mindmap generation error:`, error);
      const setStatus = method === 'simple' ? setSimpleMindmapStatus : setMindmapStatus;
      const setError = method === 'simple' ? setSimpleMindmapError : setMindmapError;
      
      setStatus('error');
      setError(error.response?.data?.detail || error.message || '生成思维导图失败');
      toast.error('生成思维导图失败');
    }
  };

  const handleDebugMindmap = () => {
    console.log('=== 思维导图调试信息 ===');
    console.log('文档状态:', document);
    console.log('标准模式状态:', mindmapStatus);
    console.log('简化模式状态:', simpleMindmapStatus);
    console.log('当前模式:', currentMindmapMode);
    console.log('选择的模式:', selectedMode);
    console.log('是否为PDF:', isPdfFile);
    console.log('查看模式:', viewMode);
    console.log('========================');
    
    toast.success('调试信息已输出到控制台');
  };

  const handleDownloadMarkdown = () => {
    if (!document) return;
    
    const blob = new Blob([document.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${documentId}.md`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Markdown文件下载成功');
  };

  const handleDownloadMermaid = (mode = 'standard') => {
    if (!document) return;
    
    const mermaidCode = mode === 'simple' ? document.mermaid_code_simple : document.mermaid_code;
    if (!mermaidCode) return;
    
    const modeText = mode === 'simple' ? '_simple' : '';
    const blob = new Blob([mermaidCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${documentId}_mindmap${modeText}.mmd`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const downloadText = mode === 'simple' ? '快速Mermaid代码' : '详细Mermaid代码';
    toast.success(`${downloadText}下载成功`);
  };

  const handleOpenMermaidEditor = (mode = 'standard') => {
    if (!document) return;
    
    const mermaidCode = mode === 'simple' ? document.mermaid_code_simple : document.mermaid_code;
    if (!mermaidCode) return;
    
    try {
      const safeBtoa = (str) => {
        return btoa(unescape(encodeURIComponent(str)));
      };
      
      const mermaidConfig = {
        code: mermaidCode,
        mermaid: { theme: 'default' }
      };
      
      const configJson = JSON.stringify(mermaidConfig);
      const encodedConfig = safeBtoa(configJson);
      const url = `https://mermaid.live/edit#pako:${encodedConfig}`;
      
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error opening Mermaid editor:', error);
      
      const simpleUrl = `https://mermaid.live/edit#base64:${encodeURIComponent(mermaidCode)}`;
      window.open(simpleUrl, '_blank');
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(mermaidCode).then(() => {
          toast.success('Mermaid代码已复制到剪贴板，可手动粘贴到编辑器中');
        }).catch(() => {
          toast.error('无法打开在线编辑器，请手动复制代码');
        });
      } else {
        toast.error('无法打开在线编辑器，请使用下载功能获取代码');
      }
    }
  };

  const MindmapStatusDisplay = () => {
    const currentStatus = currentMindmapMode === 'simple' ? simpleMindmapStatus : mindmapStatus;
    const currentError = currentMindmapMode === 'simple' ? simpleMindmapError : mindmapError;
    
    const getStatusIcon = () => {
      switch (currentStatus) {
        case 'not_started':
          return <Play className="w-5 h-5 text-gray-400" />;
        case 'generating':
          return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>;
        case 'completed':
          return <CheckCircle className="w-5 h-5 text-green-600" />;
        case 'error':
          return <XCircle className="w-5 h-5 text-red-600" />;
        default:
          return <Clock className="w-5 h-5 text-gray-400" />;
      }
    };

    const getStatusText = () => {
      const modeText = currentMindmapMode === 'simple' ? '快速' : '详细';
      switch (currentStatus) {
        case 'not_started':
          return `准备生成${modeText}思维导图`;
        case 'generating':
          return `正在生成${modeText}思维导图...`;
        case 'completed':
          return `${modeText}思维导图已生成`;
        case 'error':
          return currentError || '生成失败';
        default:
          return '未知状态';
      }
    };

    const getStatusColor = () => {
      switch (currentStatus) {
        case 'generating':
          return 'text-blue-600';
        case 'completed':
          return 'text-green-600';
        case 'error':
          return 'text-red-600';
        default:
          return 'text-gray-600';
      }
    };

    return (
      <div className={`flex items-center space-x-2 ${getStatusColor()}`}>
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
        {currentStatus === 'error' && (
          <button
            onClick={() => startMindmapGeneration(currentMindmapMode)}
            className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors"
          >
            重试
          </button>
        )}
      </div>
    );
  };

  // PDF查看器组件
  const PDFViewer = ({ pdfBase64 }) => {
    if (!pdfBase64) {
      return (
        <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
          <div className="text-center">
            <File className="h-12 w-12 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500">PDF文件不可用</p>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-white">
        <embed
          src={`data:application/pdf;base64,${pdfBase64}`}
          type="application/pdf"
          width="100%"
          height="100%"
          className="border-0 rounded-none block"
          style={{ 
            minHeight: '100%',
            margin: 0,
            padding: 0,
            display: 'block'
          }}
        />
      </div>
    );
  };

  // 文档查看区域切换按钮
  const ViewModeToggle = () => {
    if (!isPdfFile) return null;

    return (
      <div className="flex bg-gray-100 p-0.5 rounded mb-2">
        <button
          onClick={() => setViewMode('markdown')}
          className={`flex-1 flex items-center justify-center px-2 py-1 rounded text-xs font-medium transition-all ${
            viewMode === 'markdown'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <FileText className="h-3 w-3 mr-1" />
          转换后的Markdown
        </button>
        <button
          onClick={() => setViewMode('pdf')}
          className={`flex-1 flex items-center justify-center px-2 py-1 rounded text-xs font-medium transition-all ${
            viewMode === 'pdf'
              ? 'bg-white text-red-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <File className="h-3 w-3 mr-1" />
          原始PDF文件
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-700">正在加载文档...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-800 mb-2">加载失败</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <div className="space-x-3">
              <button
                onClick={loadDocument}
                className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                重试
              </button>
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-gray-700">文档不存在</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 overflow-hidden flex flex-col">
      {/* 可调整大小的分割容器 - 占据剩余空间 */}
      <div ref={containerRef} className="flex flex-1 h-full">
        {/* 左侧文档阅读器 - 动态宽度 */}
        <div 
          className="bg-white border-r shadow-sm overflow-hidden flex flex-col"
          style={{ width: `${leftPanelWidth}%` }}
        >
          <div className="px-3 py-2 border-b bg-gray-50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center px-2 py-1 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeft className="w-3 h-3 mr-1" />
                  返回
                </button>
                <h2 className="text-sm font-semibold text-gray-900">
                  文档内容
                  {isPdfFile && (
                    <span className="ml-2 text-xs text-gray-500">
                      ({viewMode === 'pdf' ? '原始PDF' : '转换后的Markdown'})
                    </span>
                  )}
                </h2>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleDownloadMarkdown}
                  className="inline-flex items-center px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                >
                  <Download className="w-3 h-3 mr-1" />
                  下载MD
                </button>
              </div>
            </div>
            {/* 切换按钮 */}
            <ViewModeToggle />
          </div>
          <div className={`flex-1 ${viewMode === 'pdf' && isPdfFile ? 'overflow-hidden' : 'overflow-y-auto p-4'}`}>
            {viewMode === 'pdf' && isPdfFile ? (
              <PDFViewer pdfBase64={document.pdf_base64} />
            ) : (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 text-gray-900 border-b pb-2" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-2 text-gray-800 mt-4" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-lg font-medium mb-2 text-gray-700 mt-3" {...props} />,
                    p: ({node, ...props}) => <p className="mb-3 text-gray-600 leading-relaxed text-sm" {...props} />,
                    ul: ({node, ...props}) => <ul className="mb-3 ml-4 list-disc" {...props} />,
                    ol: ({node, ...props}) => <ol className="mb-3 ml-4 list-decimal" {...props} />,
                    li: ({node, ...props}) => <li className="mb-1 text-gray-600 text-sm" {...props} />,
                    blockquote: ({node, ...props}) => (
                      <blockquote className="border-l-4 border-blue-500 pl-3 py-2 mb-3 bg-blue-50 text-gray-700 italic text-sm" {...props} />
                    ),
                    code: ({node, inline, ...props}) => 
                      inline 
                        ? <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-red-600" {...props} />
                        : <code className="block bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto text-xs font-mono" {...props} />,
                    pre: ({node, ...props}) => <pre className="mb-3 overflow-x-auto" {...props} />,
                  }}
                >
                  {document.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>

        {/* 可拖拽的分隔线 */}
        <div
          className={`w-1 bg-gray-300 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors ${
            isDragging ? 'bg-blue-500' : ''
          }`}
          onMouseDown={handleMouseDown}
        >
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-0.5 h-8 bg-white opacity-50 rounded"></div>
          </div>
        </div>

        {/* 右侧思维导图 - 动态宽度 */}
        <div 
          className="bg-white overflow-hidden flex flex-col"
          style={{ width: `${100 - leftPanelWidth}%` }}
        >
          <div className="px-4 py-3 border-b bg-gray-50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">思维导图</h2>
              <div className="flex items-center space-x-2">
                <MindmapStatusDisplay />
                <div className="flex items-center space-x-1">
                  {document.mermaid_code && (
                    <button
                      onClick={() => handleDownloadMermaid('standard')}
                      className="inline-flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      详细
                    </button>
                  )}
                  
                  {document.mermaid_code_simple && (
                    <button
                      onClick={() => handleDownloadMermaid('simple')}
                      className="inline-flex items-center px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      快速
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center space-x-1 text-xs text-gray-500">
                <span>{currentMindmapMode === 'simple' ? '快速模式' : '详细模式'}</span>
                {autoStarted && (
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    自动生成中
                  </span>
                )}
              </div>
              {(document.mermaid_code || document.mermaid_code_simple) && (
                <div className="flex space-x-1">
                  {document.mermaid_code && (
                    <button
                      onClick={() => setCurrentMindmapMode('standard')}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        currentMindmapMode === 'standard'
                          ? 'bg-blue-100 text-blue-700 border border-blue-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      详细版本
                    </button>
                  )}
                  {document.mermaid_code_simple && (
                    <button
                      onClick={() => setCurrentMindmapMode('simple')}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        currentMindmapMode === 'simple'
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      快速版本
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {((currentMindmapMode === 'standard' && mindmapStatus === 'completed' && document.mermaid_code) ||
              (currentMindmapMode === 'simple' && simpleMindmapStatus === 'completed' && document.mermaid_code_simple)) ? (
              <div className="h-full overflow-hidden">
                <MermaidDiagram 
                  code={currentMindmapMode === 'simple' ? document.mermaid_code_simple : document.mermaid_code} 
                />
              </div>
            ) : ((currentMindmapMode === 'standard' && mindmapStatus === 'generating') ||
                  (currentMindmapMode === 'simple' && simpleMindmapStatus === 'generating')) ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-base text-gray-700 mb-2">
                    正在生成{currentMindmapMode === 'simple' ? '快速' : '详细'}思维导图...
                  </p>
                  <p className="text-xs text-gray-500">
                    {currentMindmapMode === 'simple' ? '预计1-2分钟完成' : '这可能需要3-5分钟时间'}
                  </p>
                  <div className="mt-3 text-xs text-gray-400">
                    根据上传时的选择自动生成
                  </div>
                </div>
              </div>
            ) : ((currentMindmapMode === 'standard' && mindmapStatus === 'error') ||
                  (currentMindmapMode === 'simple' && simpleMindmapStatus === 'error')) ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md px-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="text-base font-semibold text-red-800 mb-2">生成失败</h3>
                    <p className="text-sm text-red-600 mb-3">
                      {currentMindmapMode === 'simple' ? simpleMindmapError : mindmapError}
                    </p>
                    <button
                      onClick={() => startMindmapGeneration(currentMindmapMode)}
                      className="inline-flex items-center px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      重试生成
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md px-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                    <h3 className="text-base font-semibold text-gray-800 mb-3">开始生成思维导图</h3>
                    
                    <div className="grid grid-cols-1 gap-3 mb-4">
                      <button
                        onClick={() => startMindmapGeneration('simple')}
                        className="flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                        disabled={simpleMindmapStatus === 'generating'}
                      >
                        <Zap className="w-4 h-4 mr-2" />
                        <div className="text-left">
                          <div className="text-sm font-medium">快速模式</div>
                          <div className="text-xs opacity-90">1-2分钟生成</div>
                        </div>
                      </button>
                      
                      <button
                        onClick={() => startMindmapGeneration('standard')}
                        className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        disabled={mindmapStatus === 'generating'}
                      >
                        <BarChart3 className="w-4 h-4 mr-2" />
                        <div className="text-left">
                          <div className="text-sm font-medium">详细模式</div>
                          <div className="text-xs opacity-90">3-5分钟生成</div>
                        </div>
                      </button>
                    </div>
                    
                    {(document.mermaid_code || document.mermaid_code_simple) && (
                      <div className="border-t pt-3 mt-3">
                        <p className="text-xs text-gray-600 mb-2">查看已生成的思维导图：</p>
                        <div className="flex space-x-2">
                          {document.mermaid_code && (
                            <button
                              onClick={() => setCurrentMindmapMode('standard')}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                currentMindmapMode === 'standard'
                                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              详细版本
                            </button>
                          )}
                          {document.mermaid_code_simple && (
                            <button
                              onClick={() => setCurrentMindmapMode('simple')}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                currentMindmapMode === 'simple'
                                  ? 'bg-green-100 text-green-700 border border-green-300'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              快速版本
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewerPage; 