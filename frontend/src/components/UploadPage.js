import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, FileText, AlertCircle, Zap, BarChart3 } from 'lucide-react';
import axios from 'axios';

const UploadPage = () => {
  const [uploading, setUploading] = useState(false);
  const [selectedMode, setSelectedMode] = useState('simple'); // 'simple' or 'standard'
  const navigate = useNavigate();

  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    
    if (!file) {
      toast.error('请选择一个文件');
      return;
    }

    // 验证文件类型
    if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
      toast.error('只支持 .md 和 .txt 文件');
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
        const modeText = selectedMode === 'simple' ? '快速' : '详细';
        toast.success(`文件上传成功，将使用${modeText}模式生成思维导图...`);
        
        // 立即跳转到查看页面，并传递选择的模式
        navigate(`/viewer/${response.data.document_id}`, { 
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
    },
    multiple: false,
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            上传 Markdown 文件
          </h2>
          <p className="text-lg text-gray-600">
            支持 .md 和 .txt 格式文件，选择生成模式后自动生成智能思维导图
          </p>
        </div>

        {/* 生成模式选择 */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">选择思维导图生成模式</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div 
              className={`cursor-pointer border-2 rounded-lg p-6 transition-all ${
                selectedMode === 'simple' 
                  ? 'border-green-500 bg-green-50 shadow-md' 
                  : 'border-gray-200 hover:border-green-300 hover:bg-gray-50'
              }`}
              onClick={() => setSelectedMode('simple')}
            >
              <div className="flex items-center mb-3">
                <Zap className="h-6 w-6 text-green-600 mr-2" />
                <h4 className="font-semibold text-gray-900">快速简化模式</h4>
                {selectedMode === 'simple' && (
                  <div className="ml-auto w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-2">
                ⏱️ <strong>1-2分钟</strong> 快速生成
              </p>
              <p className="text-sm text-gray-600 mb-2">
                📊 基础结构分析，适合快速预览
              </p>
              <p className="text-sm text-gray-600">
                💡 推荐用于初步了解文档结构
              </p>
            </div>

            <div 
              className={`cursor-pointer border-2 rounded-lg p-6 transition-all ${
                selectedMode === 'standard' 
                  ? 'border-blue-500 bg-blue-50 shadow-md' 
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
              }`}
              onClick={() => setSelectedMode('standard')}
            >
              <div className="flex items-center mb-3">
                <BarChart3 className="h-6 w-6 text-blue-600 mr-2" />
                <h4 className="font-semibold text-gray-900">标准详细模式</h4>
                {selectedMode === 'standard' && (
                  <div className="ml-auto w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-2">
                ⏱️ <strong>3-5分钟</strong> 深度分析
              </p>
              <p className="text-sm text-gray-600 mb-2">
                🔍 详细内容提取，层次化结构
              </p>
              <p className="text-sm text-gray-600">
                🎯 推荐用于深入分析和学习
              </p>
            </div>
          </div>
        </div>

        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all duration-200
            ${isDragActive 
              ? 'border-blue-400 bg-blue-50' 
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }
            ${uploading ? 'pointer-events-none opacity-50' : ''}
          `}
        >
          <input {...getInputProps()} />
          
          <div className="flex flex-col items-center">
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-lg font-medium text-gray-700">正在上传文件...</p>
                <p className="text-sm text-gray-500 mt-2">
                  上传完成后将使用{selectedMode === 'simple' ? '快速' : '详细'}模式生成思维导图
                </p>
              </>
            ) : (
              <>
                <Upload className="h-12 w-12 text-gray-400 mb-4" />
                {isDragActive ? (
                  <p className="text-lg font-medium text-blue-600">
                    松开鼠标上传文件
                  </p>
                ) : (
                  <>
                    <p className="text-lg font-medium text-gray-700 mb-2">
                      拖拽文件到此处，或点击选择文件
                    </p>
                    <p className="text-sm text-gray-500 mb-2">
                      支持 .md 和 .txt 文件，最大 10MB
                    </p>
                    <p className="text-xs text-gray-400">
                      当前选择：{selectedMode === 'simple' ? '快速简化模式' : '标准详细模式'}
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <FileText className="h-8 w-8 text-green-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-2">即时阅读</h3>
            <p className="text-sm text-gray-600">
              上传后立即显示文档内容，方便阅读和编辑
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <AlertCircle className="h-8 w-8 text-blue-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-2">AI 智能分析</h3>
            <p className="text-sm text-gray-600">
              根据选择的模式自动生成对应详细程度的思维导图
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            上传的文件将会被安全处理，根据所选模式生成思维导图
          </p>
        </div>
      </div>
    </div>
  );
};

export default UploadPage; 