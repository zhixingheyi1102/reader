import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { ArrowLeft, Download, ExternalLink, RefreshCw, Play, Clock, CheckCircle, XCircle, Zap, BarChart3 } from 'lucide-react';
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
          filename: docData.filename
        });
        
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
    <div className="min-h-screen bg-gray-50">
      {/* 顶部工具栏 */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center px-3 py-1.5 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                返回
              </button>
              <div className="text-sm text-gray-500">
                {document.filename && `${document.filename} • `}文档ID: {documentId}
              </div>
              <MindmapStatusDisplay />
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={handleDownloadMarkdown}
                className="inline-flex items-center px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4 mr-1" />
                下载MD
              </button>
              
              {document.mermaid_code && (
                <button
                  onClick={() => handleDownloadMermaid('standard')}
                  className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4 mr-1" />
                  下载详细图表
                </button>
              )}
              
              {document.mermaid_code_simple && (
                <button
                  onClick={() => handleDownloadMermaid('simple')}
                  className="inline-flex items-center px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                >
                  <Download className="w-4 h-4 mr-1" />
                  下载快速图表
                </button>
              )}
              
              {(document.mermaid_code || document.mermaid_code_simple) && (
                <button
                  onClick={() => {
                    const mode = currentMindmapMode;
                    const hasCode = mode === 'simple' ? document.mermaid_code_simple : document.mermaid_code;
                    if (hasCode) {
                      handleOpenMermaidEditor(mode);
                    }
                  }}
                  className="inline-flex items-center px-3 py-1.5 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  编辑{currentMindmapMode === 'simple' ? '快速' : '详细'}图表
                </button>
              )}
              
              <button
                onClick={handleDebugMindmap}
                className="inline-flex items-center px-3 py-1.5 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                title="调试思维导图状态"
              >
                🐛 调试
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="max-w-7xl mx-auto flex h-[calc(100vh-64px)]">
        {/* 左侧Markdown阅读器 */}
        <div className="w-2/3 bg-white border-r shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">文档内容</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({node, ...props}) => <h1 className="text-3xl font-bold mb-4 text-gray-900 border-b pb-2" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-2xl font-semibold mb-3 text-gray-800 mt-6" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-xl font-medium mb-2 text-gray-700 mt-4" {...props} />,
                  p: ({node, ...props}) => <p className="mb-4 text-gray-600 leading-relaxed" {...props} />,
                  ul: ({node, ...props}) => <ul className="mb-4 ml-6 list-disc" {...props} />,
                  ol: ({node, ...props}) => <ol className="mb-4 ml-6 list-decimal" {...props} />,
                  li: ({node, ...props}) => <li className="mb-1 text-gray-600" {...props} />,
                  blockquote: ({node, ...props}) => (
                    <blockquote className="border-l-4 border-blue-500 pl-4 py-2 mb-4 bg-blue-50 text-gray-700 italic" {...props} />
                  ),
                  code: ({node, inline, ...props}) => 
                    inline 
                      ? <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-red-600" {...props} />
                      : <code className="block bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono" {...props} />,
                  pre: ({node, ...props}) => <pre className="mb-4 overflow-x-auto" {...props} />,
                }}
              >
                {document.content}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        {/* 右侧思维导图 */}
        <div className="w-1/3 bg-white overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">思维导图</h2>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">
                  {currentMindmapMode === 'simple' ? '快速模式' : '详细模式'}
                </span>
                {autoStarted && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    自动生成中
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {((currentMindmapMode === 'standard' && mindmapStatus === 'completed' && document.mermaid_code) ||
              (currentMindmapMode === 'simple' && simpleMindmapStatus === 'completed' && document.mermaid_code_simple)) ? (
              <div className="h-full overflow-auto p-4">
                <MermaidDiagram 
                  code={currentMindmapMode === 'simple' ? document.mermaid_code_simple : document.mermaid_code} 
                />
              </div>
            ) : ((currentMindmapMode === 'standard' && mindmapStatus === 'generating') ||
                  (currentMindmapMode === 'simple' && simpleMindmapStatus === 'generating')) ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-lg text-gray-700 mb-2">
                    正在生成{currentMindmapMode === 'simple' ? '快速' : '详细'}思维导图...
                  </p>
                  <p className="text-sm text-gray-500">
                    {currentMindmapMode === 'simple' ? '预计1-2分钟完成' : '这可能需要3-5分钟时间'}
                  </p>
                  <div className="mt-4 text-xs text-gray-400">
                    根据上传时的选择自动生成
                  </div>
                </div>
              </div>
            ) : ((currentMindmapMode === 'standard' && mindmapStatus === 'error') ||
                  (currentMindmapMode === 'simple' && simpleMindmapStatus === 'error')) ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center">
                  <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-lg text-red-700 mb-2">生成失败</p>
                  <p className="text-sm text-gray-600 mb-4">
                    {currentMindmapMode === 'simple' ? simpleMindmapError : mindmapError}
                  </p>
                  <div className="space-y-2">
                    <button
                      onClick={() => startMindmapGeneration(currentMindmapMode)}
                      className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      重新生成
                    </button>
                    <div className="mt-2">
                      <button
                        onClick={() => {
                          const otherMode = currentMindmapMode === 'simple' ? 'standard' : 'simple';
                          setCurrentMindmapMode(otherMode);
                          startMindmapGeneration(otherMode);
                        }}
                        className="inline-flex items-center px-3 py-1.5 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                      >
                        {currentMindmapMode === 'simple' ? <BarChart3 className="w-3 h-3 mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                        尝试{currentMindmapMode === 'simple' ? '详细' : '快速'}模式
                      </button>
                    </div>
                    <button
                      onClick={handleDebugMindmap}
                      className="block mx-auto text-xs text-gray-500 hover:text-gray-700"
                    >
                      查看调试信息
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                    {currentMindmapMode === 'simple' ? (
                      <Zap className="w-6 h-6 text-green-600" />
                    ) : (
                      <BarChart3 className="w-6 h-6 text-blue-600" />
                    )}
                  </div>
                  <p className="text-lg text-gray-700 mb-2">准备生成思维导图</p>
                  <p className="text-sm text-gray-500 mb-4">
                    当前模式：{currentMindmapMode === 'simple' ? '快速简化' : '标准详细'}
                  </p>
                  
                  {!autoStarted && (
                    <div className="space-y-3">
                      <button
                        onClick={() => startMindmapGeneration(currentMindmapMode)}
                        className={`w-full inline-flex items-center justify-center px-4 py-3 rounded-md transition-colors ${
                          currentMindmapMode === 'simple' 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        开始生成{currentMindmapMode === 'simple' ? '快速' : '详细'}思维导图
                      </button>
                      
                      <button
                        onClick={() => {
                          const otherMode = currentMindmapMode === 'simple' ? 'standard' : 'simple';
                          setCurrentMindmapMode(otherMode);
                        }}
                        className="w-full inline-flex items-center justify-center px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        {currentMindmapMode === 'simple' ? <BarChart3 className="w-3 h-3 mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                        切换到{currentMindmapMode === 'simple' ? '详细' : '快速'}模式
                      </button>
                    </div>
                  )}
                  
                  {(document.mermaid_code || document.mermaid_code_simple) && (
                    <div className="border-t pt-4 mt-4">
                      <p className="text-sm text-gray-600 mb-3">查看已生成的思维导图：</p>
                      <div className="flex space-x-2">
                        {document.mermaid_code && (
                          <button
                            onClick={() => setCurrentMindmapMode('standard')}
                            className={`px-3 py-1.5 text-xs rounded transition-colors ${
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
                            className={`px-3 py-1.5 text-xs rounded transition-colors ${
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
                  
                  <button
                    onClick={handleDebugMindmap}
                    className="block mx-auto text-xs text-gray-500 hover:text-gray-700 mt-4"
                  >
                    查看当前状态
                  </button>
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