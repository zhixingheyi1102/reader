import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, FileText, AlertCircle, Zap, BarChart3, Eye } from 'lucide-react';
import axios from 'axios';

const UploadPage = () => {
  const [uploading, setUploading] = useState(false);
  const [selectedMode, setSelectedMode] = useState('simple'); // 'simple', 'standard', or 'demo'
  const navigate = useNavigate();

  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    
    if (!file) {
      toast.error('请选择一个文件');
      return;
    }

    // 验证文件类型
    if (!file.name.endsWith('.md') && !file.name.endsWith('.txt') && !file.name.endsWith('.pdf')) {
      toast.error('只支持 .md、.txt 和 .pdf 文件');
      return;
    }

    // 验证文件大小 (10MB限制)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('文件大小不能超过 10MB');
      return;
    }

    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      // 使用新的文档上传API
      const response = await axios.post('http://localhost:8000/api/upload-document', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        let documentId = response.data.document_id;
        
        // 如果是演示模式，给文档ID添加demo前缀
        if (selectedMode === 'demo') {
          documentId = 'demo-' + documentId;
          toast.success('文件上传成功，将使用演示模式展示复杂思维导图示例...');
        } else {
          const modeText = selectedMode === 'simple' ? '快速' : '详细';
          toast.success(`文件上传成功，将使用${modeText}模式生成思维导图...`);
        }
        
        // 立即跳转到查看页面，并传递选择的模式
        navigate(`/viewer/${documentId}`, { 
          state: { selectedMode: selectedMode }
        });
      } else {
        toast.error('上传失败，请重试');
      }
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error.response?.data?.detail || '上传失败，请检查网络连接';
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/markdown': ['.md'],
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            上传文档文件
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            支持 .md、.txt 和 .pdf 格式文件，PDF文件将自动转换为Markdown，选择生成模式后自动生成智能思维导图
          </p>
        </div>

        {/* 生成模式选择 */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">选择思维导图生成模式</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              className={`cursor-pointer border-2 rounded-lg p-6 transition-all ${
                selectedMode === 'simple' 
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20 shadow-md' 
                  : 'border-gray-200 dark:border-gray-600 hover:border-green-300 dark:hover:border-green-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setSelectedMode('simple')}
            >
              <div className="flex items-center mb-3">
                <Zap className="h-6 w-6 text-green-600 dark:text-green-400 mr-2" />
                <h4 className="font-semibold text-gray-900 dark:text-white">快速简化模式</h4>
                {selectedMode === 'simple' && (
                  <div className="ml-auto w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                ⏱️ <strong>1-2分钟</strong> 快速生成
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                📊 基础结构分析，适合快速预览
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                💡 推荐用于初步了解文档结构
              </p>
            </div>

            <div 
              className={`cursor-pointer border-2 rounded-lg p-6 transition-all ${
                selectedMode === 'standard' 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md' 
                  : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setSelectedMode('standard')}
            >
              <div className="flex items-center mb-3">
                <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-2" />
                <h4 className="font-semibold text-gray-900 dark:text-white">标准详细模式</h4>
                {selectedMode === 'standard' && (
                  <div className="ml-auto w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                ⏱️ <strong>3-5分钟</strong> 深度分析
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                🔍 详细内容提取，层次化结构
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                🎯 推荐用于深入分析和学习
              </p>
            </div>

            <div 
              className={`cursor-pointer border-2 rounded-lg p-6 transition-all ${
                selectedMode === 'demo' 
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-md' 
                  : 'border-gray-200 dark:border-gray-600 hover:border-orange-300 dark:hover:border-orange-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setSelectedMode('demo')}
            >
              <div className="flex items-center mb-3">
                <Eye className="h-6 w-6 text-orange-600 dark:text-orange-400 mr-2" />
                <h4 className="font-semibold text-gray-900 dark:text-white">演示模式</h4>
                {selectedMode === 'demo' && (
                  <div className="ml-auto w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                ⚡ <strong>上传文件</strong> 或查看预设示例
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                🎨 展示复杂思维导图效果
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                📁 支持上传文件，AI助手将被禁用
              </p>
            </div>
          </div>
        </div>

        {/* 演示模式的特殊处理 */}
        {selectedMode === 'demo' ? (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">演示模式选项</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                您可以上传自己的文件体验演示效果，或直接查看预设的思维导图示例
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 上传文件选项 */}
              <div
                {...getRootProps()}
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
                  ${isDragActive 
                    ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20' 
                    : 'border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }
                  ${uploading ? 'pointer-events-none opacity-50' : ''}
                `}
              >
                <input {...getInputProps()} />
                
                <div className="flex flex-col items-center">
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mb-3"></div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">正在上传文件...</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        将使用演示模式展示思维导图
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-orange-400 mb-3" />
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">上传您的文件</h4>
                      {isDragActive ? (
                        <p className="text-sm text-orange-600 dark:text-orange-400">
                          松开鼠标上传文件
                        </p>
                      ) : (
                        <>
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                            拖拽文件到此处，或点击选择
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            支持 .md、.txt、.pdf 文件
                          </p>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 查看预设示例选项 */}
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                <div className="flex flex-col items-center">
                  <Eye className="h-8 w-8 text-orange-400 mb-3" />
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">查看预设示例</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                    无需上传文件，直接体验复杂思维导图
                  </p>
                  <button
                    onClick={() => {
                      toast.success('进入演示模式，将显示预设的思维导图示例...');
                      // 创建一个虚拟的文档ID用于演示
                      const demoDocId = 'demo-' + Date.now();
                      navigate(`/viewer/${demoDocId}`, { 
                        state: { selectedMode: 'demo' }
                      });
                    }}
                    className="inline-flex items-center px-4 py-2 bg-orange-600 hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    查看示例
                  </button>
                </div>
              </div>
            </div>
            
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                演示模式将展示复杂的思维导图效果，AI阅读助手将被禁用
              </p>
            </div>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all duration-200
              ${isDragActive 
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }
              ${uploading ? 'pointer-events-none opacity-50' : ''}
            `}
          >
            <input {...getInputProps()} />
            
            <div className="flex flex-col items-center">
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-lg font-medium text-gray-700 dark:text-gray-300">正在上传文件...</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    上传完成后将使用{selectedMode === 'simple' ? '快速' : '详细'}模式生成思维导图
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
                  {isDragActive ? (
                    <p className="text-lg font-medium text-blue-600 dark:text-blue-400">
                      松开鼠标上传文件
                    </p>
                  ) : (
                    <>
                      <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                        拖拽文件到此处，或点击选择文件
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                        支持 .md、.txt 和 .pdf 文件，最大 10MB
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        当前选择：{
                          selectedMode === 'simple' ? '快速简化模式' : 
                          selectedMode === 'demo' ? '演示模式' : '标准详细模式'
                        }
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <FileText className="h-8 w-8 text-green-600 dark:text-green-400 mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">即时阅读</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              上传后立即显示文档内容，方便阅读和编辑
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <AlertCircle className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AI 智能分析</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              根据选择的模式自动生成对应详细程度的思维导图
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <Eye className="h-8 w-8 text-orange-600 dark:text-orange-400 mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">演示体验</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              无需上传文件即可体验完整的思维导图功能
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {selectedMode === 'demo' 
              ? '演示模式支持上传文件或查看预设示例，AI阅读助手将被禁用以展示纯思维导图效果'
              : '上传的文件将会被安全处理，根据所选模式生成思维导图'
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default UploadPage; 