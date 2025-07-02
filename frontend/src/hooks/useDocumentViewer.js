import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

export const useDocumentViewer = () => {
  const { documentId } = useParams();
  
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // 文档查看模式相关状态
  const [viewMode, setViewMode] = useState('markdown');
  const [isPdfFile, setIsPdfFile] = useState(false);
  
  // 文档结构和目录相关状态
  const [documentStructure, setDocumentStructure] = useState(null);
  const [toc, setToc] = useState([]);
  const [expandedTocItems, setExpandedTocItems] = useState(new Set());

  const loadDocument = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 检查是否为演示模式（URL中包含demo-前缀）
      const isDemo = documentId.startsWith('demo-');
      let actualDocumentId = documentId;
      
      // 如果是演示模式，去掉demo-前缀获取真实的文档ID
      if (isDemo) {
        actualDocumentId = documentId.replace('demo-', '');
        console.log('🎨 [演示模式] 检测到演示模式，原始ID:', documentId, '实际ID:', actualDocumentId);
      }
      
      const statusResponse = await axios.get(`http://localhost:8000/api/document-status/${actualDocumentId}`);
      
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
        
        console.log('📄 [文档加载] 成功加载文档，演示模式:', isDemo);
      } else {
        const response = await axios.get(`http://localhost:8000/api/document/${actualDocumentId}`);
        
        if (response.data.success) {
          setDocument(response.data);
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

  const loadDocumentStructure = async () => {
    try {
      // 获取实际的文档ID（去掉demo-前缀）
      const actualDocumentId = documentId.startsWith('demo-') 
        ? documentId.replace('demo-', '') 
        : documentId;
        
      const response = await axios.get(`http://localhost:8000/api/document-toc/${actualDocumentId}`);
      
      if (response.data.success) {
        setToc(response.data.toc);
        // 默认展开所有一级目录
        const topLevelItems = new Set(response.data.toc.filter(item => item.level === 1).map(item => item.id));
        setExpandedTocItems(topLevelItems);
        
        // 获取文档结构信息
        const structureResponse = await axios.get(`http://localhost:8000/api/document-structure/${actualDocumentId}`);
        if (structureResponse.data.success) {
          setDocumentStructure(structureResponse.data.structure);
          const chunks = structureResponse.data.chunks || [];
          
          console.log('📄 [文档结构] 加载了', chunks.length, '个内容块:', chunks.map(c => ({ id: c.chunk_id, heading: c.heading })));
          
          return chunks;
        }
        
        console.log('📄 [目录加载] 成功加载', response.data.toc.length, '个目录项');
      }
    } catch (error) {
      console.error('Load document structure error:', error);
    }
    return [];
  };

  const toggleTocItem = (itemId) => {
    setExpandedTocItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  return {
    documentId,
    document,
    setDocument,
    loading,
    error,
    viewMode,
    setViewMode,
    isPdfFile,
    documentStructure,
    toc,
    expandedTocItems,
    toggleTocItem,
    loadDocument,
    loadDocumentStructure
  };
}; 