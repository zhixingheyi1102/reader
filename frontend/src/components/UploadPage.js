import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, FileText, AlertCircle } from 'lucide-react';
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
        toast.success('文件上传成功，正在跳转到阅读器...');
        // 立即跳转到查看页面，显示文档内容
        // 思维导图将在阅读器页面中异步生成
        navigate(`/viewer/${response.data.document_id}`);
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
            支持 .md 和 .txt 格式文件，先显示文档内容，再生成智能思维导图
          </p>
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
                <p className="text-sm text-gray-500 mt-2">上传完成后将跳转到文档阅读器</p>
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
                    <p className="text-sm text-gray-500">
                      支持 .md 和 .txt 文件，最大 10MB
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
              在阅读器中异步生成结构化思维导图
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            上传的文件将会被安全处理，先显示文档内容，然后自动生成思维导图
          </p>
        </div>
      </div>
    </div>
  );
};

export default UploadPage; 