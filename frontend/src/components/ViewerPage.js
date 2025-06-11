import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { ArrowLeft, Download, ExternalLink, RefreshCw, Play, Clock, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';
import MermaidDiagram from './MermaidDiagram';

const ViewerPage = () => {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mindmapStatus, setMindmapStatus] = useState('not_started'); // not_started, generating, completed, error
  const [mindmapError, setMindmapError] = useState(null);

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  // 轮询检查思维导图生成状态
  useEffect(() => {
    let pollInterval;
    
    if (mindmapStatus === 'generating') {
      pollInterval = setInterval(async () => {
        try {
          const response = await axios.get(`http://localhost:8000/api/document-status/${documentId}`);
          if (response.data.success) {
            const status = response.data.status;
            setMindmapStatus(status);
            
            if (status === 'completed' && response.data.mermaid_code) {
              setDocument(prev => ({
                ...prev,
                mermaid_code: response.data.mermaid_code
              }));
              toast.success('思维导图生成完成！');
            } else if (status === 'error') {
              setMindmapError(response.data.error || '生成思维导图时出错');
              toast.error('思维导图生成失败');
            }
          }
        } catch (error) {
          console.error('Poll status error:', error);
        }
      }, 2000); // 每2秒检查一次
    }
    
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [mindmapStatus, documentId]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 首先尝试获取文档状态
      const statusResponse = await axios.get(`http://localhost:8000/api/document-status/${documentId}`);
      
      if (statusResponse.data.success) {
        const docData = statusResponse.data;
        setDocument({
          document_id: docData.document_id,
          content: docData.content,
          mermaid_code: docData.mermaid_code,
          filename: docData.filename
        });
        
        // 设置思维导图状态
        setMindmapStatus(docData.status);
        
        // 如果还没有开始生成思维导图，自动开始生成
        if (docData.status === 'uploaded') {
          await startMindmapGeneration();
        }
      } else {
        // 如果新API不可用，回退到旧API
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

  const startMindmapGeneration = async () => {
    try {
      setMindmapStatus('generating');
      setMindmapError(null);
      
      const response = await axios.post(`http://localhost:8000/api/generate-mindmap/${documentId}`);
      
      if (response.data.success) {
        toast.success('开始生成思维导图...');
        
        // 如果立即完成，更新状态
        if (response.data.status === 'completed' && response.data.mermaid_code) {
          setMindmapStatus('completed');
          setDocument(prev => ({
            ...prev,
            mermaid_code: response.data.mermaid_code
          }));
          toast.success('思维导图生成完成！');
        }
      } else {
        throw new Error(response.data.message || '开始生成失败');
      }
    } catch (error) {
      console.error('Start mindmap generation error:', error);
      setMindmapStatus('error');
      setMindmapError(error.response?.data?.detail || error.message || '生成思维导图失败');
      toast.error('生成思维导图失败');
    }
  };

  const handleDebugMindmap = () => {
    console.log('=== 思维导图调试信息 ===');
    console.log('文档状态:', document);
    console.log('思维导图状态:', mindmapStatus);
    console.log('思维导图代码存在:', !!document?.mermaid_code);
    console.log('思维导图代码长度:', document?.mermaid_code?.length || 0);
    console.log('思维导图代码预览:', document?.mermaid_code?.substring(0, 200) + '...');
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

  const handleDownloadMermaid = () => {
    if (!document || !document.mermaid_code) return;
    
    const blob = new Blob([document.mermaid_code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${documentId}_mindmap.mmd`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Mermaid代码下载成功');
  };

  const handleOpenMermaidEditor = () => {
    if (!document || !document.mermaid_code) return;
    
    try {
      // 使用安全的方式处理包含中文的字符串
      const safeBtoa = (str) => {
        return btoa(unescape(encodeURIComponent(str)));
      };
      
      // 创建Mermaid Live Editor的链接
      const mermaidConfig = {
        code: document.mermaid_code,
        mermaid: { theme: 'default' }
      };
      
      const configJson = JSON.stringify(mermaidConfig);
      const encodedConfig = safeBtoa(configJson);
      const url = `https://mermaid.live/edit#pako:${encodedConfig}`;
      
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error opening Mermaid editor:', error);
      
      // 如果编码失败，使用简单的URL参数方式
      const simpleUrl = `https://mermaid.live/edit#base64:${encodeURIComponent(document.mermaid_code)}`;
      window.open(simpleUrl, '_blank');
      
      // 也可以复制代码到剪贴板作为备选方案
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(document.mermaid_code).then(() => {
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
    const getStatusIcon = () => {
      switch (mindmapStatus) {
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
      switch (mindmapStatus) {
        case 'not_started':
          return '准备生成思维导图';
        case 'generating':
          return '正在生成思维导图...';
        case 'completed':
          return '思维导图已生成';
        case 'error':
          return mindmapError || '生成失败';
        default:
          return '未知状态';
      }
    };

    const getStatusColor = () => {
      switch (mindmapStatus) {
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
        {mindmapStatus === 'error' && (
          <button
            onClick={startMindmapGeneration}
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
              <button
                onClick={handleDownloadMermaid}
                disabled={!document.mermaid_code}
                className={`inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${
                  document.mermaid_code
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Download className="w-4 h-4 mr-1" />
                下载图表
              </button>
              <button
                onClick={handleOpenMermaidEditor}
                disabled={!document.mermaid_code}
                className={`inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${
                  document.mermaid_code
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                编辑图表
              </button>
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
        {/* 左侧Markdown阅读器 - 占2/3宽度 */}
        <div className="w-2/3 bg-white border-r shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">文档内容</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none">
              <ReactMarkdown
                components={{
                  // 自定义渲染组件
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

        {/* 右侧思维导图 - 占1/3宽度 */}
        <div className="w-1/3 bg-white overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">思维导图</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            {mindmapStatus === 'completed' && document.mermaid_code ? (
              <div className="h-full overflow-auto p-4">
                <MermaidDiagram code={document.mermaid_code} />
              </div>
            ) : mindmapStatus === 'generating' ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-lg text-gray-700 mb-2">正在生成思维导图...</p>
                  <p className="text-sm text-gray-500">这可能需要几分钟时间</p>
                </div>
              </div>
            ) : mindmapStatus === 'error' ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center">
                  <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-lg text-red-700 mb-2">生成失败</p>
                  <p className="text-sm text-gray-600 mb-4">{mindmapError}</p>
                  <div className="space-y-2">
                    <button
                      onClick={startMindmapGeneration}
                      className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      重新生成
                    </button>
                    <button
                      onClick={handleDebugMindmap}
                      className="block mx-auto text-xs text-gray-500 hover:text-gray-700"
                    >
                      查看调试信息
                    </button>
                  </div>
                </div>
              </div>
            ) : mindmapStatus === 'uploaded' ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-lg text-gray-700 mb-2">准备开始生成...</p>
                  <p className="text-sm text-gray-500">即将自动开始生成思维导图</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center">
                  <Play className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg text-gray-700 mb-2">准备生成思维导图</p>
                  <div className="space-y-2">
                    <button
                      onClick={startMindmapGeneration}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      开始生成
                    </button>
                    <button
                      onClick={handleDebugMindmap}
                      className="block mx-auto text-xs text-gray-500 hover:text-gray-700"
                    >
                      查看当前状态
                    </button>
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