import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, FileText, AlertCircle, Eye } from 'lucide-react';
import axios from 'axios';

const UploadPage = () => {
  const [uploading, setUploading] = useState(false);
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
        const documentId = response.data.document_id;
        toast.success('文件上传成功，将生成论证结构流程图...');
        
        // 直接跳转到查看页面，使用论证结构分析
        navigate(`/viewer/${documentId}`);
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
            文档论证结构分析
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            上传文档文件生成论证结构流程图，或查看预设示例
          </p>
        </div>

        <div className="space-y-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">选择使用方式</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              您可以上传自己的文件进行论证结构分析，或直接查看预设的流程图示例
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 上传文件选项 */}
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
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
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">正在上传文件...</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      将分析文档的论证结构
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-blue-400 mb-3" />
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">上传您的文件</h4>
                    {isDragActive ? (
                      <p className="text-sm text-blue-600 dark:text-blue-400">
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
                  无需上传文件，直接体验论证结构分析效果
                </p>
                <button
                  onClick={() => {
                    toast.success('进入示例模式，将显示预设的论证结构流程图...');
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
              系统将自动为每个段落分配ID号，并生成论证结构的可视化流程图
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <FileText className="h-8 w-8 text-green-600 dark:text-green-400 mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">即时阅读</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              上传后立即显示文档内容，每个段落自动分配ID号
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <AlertCircle className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AI 论证分析</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              智能提取文档的核心论证结构，生成可视化流程图
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <Eye className="h-8 w-8 text-orange-600 dark:text-orange-400 mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">示例体验</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              无需上传文件即可体验完整的论证结构分析功能
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            系统将分析文档的论证结构，为每个段落分配ID，并生成包含节点映射的流程图
          </p>
        </div>
      </div>
    </div>
  );
};

export default UploadPage; 