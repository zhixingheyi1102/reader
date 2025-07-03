import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

// 获取默认的演示流程图代码
const getDefaultDemoMermaidCode = () => `---
config:
  layout: dagre
  theme: redux
  look: neo
---
%%{ init: { 'flowchart': { 'curve': 'basis' } } }%%
flowchart TD
    %% --- Link Style ---
    linkStyle default stroke:#6A99C9,stroke-width:2px,stroke-dasharray:3 3,color:#000000

    A[为什么辩证学家要学着数到四？] --引论--> B{第四方：溢出/过剩的否定性环节}
    B --核心化为--> C[核心概念：消失的中介者]
    B --导向结论--> J[结论：主体作为消失的中介者]

    C --阐述机制--> D[消失的中介者的运作机制]
    C --举例说明--> E[实例分析]
    C --揭示特性--> F{中介者的幻觉：<br/>未认识到自身行为的真实结果}
    C --关联概念--> H[消失的中介者与事件及主体]

    D --阶段1--> D1[1. 旧形式的普遍化与激进化]
    D1 --阶段2--> D2[2. 新社会内容的形成]
    D2 --阶段3--> D3[3. 中介者形式的消失/变得多余]

    E --例证一--> E1[新教伦理: 封建主义 → 资本主义]
    E --例证二--> E2[雅各宾主义: 旧制度 → 资产阶级民主]
    E --其他例证--> E3[其他例子: 绝对君主制<br/>法西斯主义等]

    F --好比--> G[与美丽灵魂的类比]

    H --定义主体--> H1[主体：在开放/不确定时刻<br/>被召唤的X]
    H --引出--> I[真理的政治性]

    H1 --其行动--> H2[行动：回溯性地创造其<br/>合理性与条件]
    H2 --其结果--> H3[设定预设：主体行动成功后<br/>被整合进新秩序并变得不可见]

    I --具体为--> I1[区分政治与政治性]
    I1 --阐释--> I2[政治性：社会结构被质疑和重塑的<br/>开放性环节，真理在此显现]
    I2 --强调--> I3[社会秩序的起源总是政治性的]

    J --进一步阐释--> J1[主体是辩证过程的第四环节<br/>其消失是其成功的标志]
    J1 --关联至--> K[真理的偶然性与创伤性]

    K --通过类比--> K1[类比格雷马斯符号学矩阵<br/>与拉康精神分析]
    K1 --揭示真理--> K2[真理作为特殊的偶然遭遇<br/>打破普遍的谎言]

    %% 额外的分析框架
    A --理论基础--> L[黑格尔辩证法的四重结构]
    L --包含--> L1[1. 直接肯定性]
    L1 --导向--> L2[2. 内在否定性/中介]
    L2 --发展为--> L3[3. 否定的否定]
    L3 --完成于--> L4[4. 主体作为消失的环节]

    %% 历史实例的详细分析
    E1 --机制分析--> M1[新教：宗教普遍化→宗教私人化]
    E2 --机制分析--> M2[雅各宾：政治激进化→资产阶级日常生活]
    M1 --> M3[共同点：形式与内容的分离]
    M2 --> M3

    %% 现代相关性
    E3 --当代例证--> N[东欧新社会运动]
    N --特征--> N1[理想主义的第三条道路]
    N1 --结果--> N2[为资本主义复辟铺路]
    N2 --验证--> C

    A:::concept
    B:::concept
    C:::concept
    J:::conclusion
    D:::mechanism
    E:::example
    F:::highlight
    H:::concept
    D1:::mechanism
    D2:::mechanism
    D3:::mechanism
    E1:::example
    E2:::example
    E3:::example
    G:::default
    H1:::default
    I:::concept
    H2:::default
    H3:::default
    I1:::default
    I2:::default
    I3:::default
    J1:::default
    K:::concept
    K1:::default
    K2:::default
    L:::theory
    L1:::theory
    L2:::theory
    L3:::theory
    L4:::theory
    M1:::analysis
    M2:::analysis
    M3:::analysis
    N:::modern
    N1:::modern
    N2:::modern`;

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
      
      // 检查是否为纯示例模式（demo-前缀 + 时间戳ID）
      if (documentId.startsWith('demo-')) {
        const actualDocumentId = documentId.replace('demo-', '');
        console.log('🎨 [示例模式] 检测到示例模式，原始ID:', documentId, '实际ID:', actualDocumentId);
        
        // 检查是否为纯示例模式（基于时间戳的虚拟ID）
        if (actualDocumentId.length > 10 && /^\d+$/.test(actualDocumentId)) {
          console.log('📝 [纯示例模式] 检测到纯示例模式，显示预设内容');
          // 创建虚拟文档对象用于纯示例模式
          setDocument({
            document_id: actualDocumentId,
            content: null, // 标记为示例模式
            mermaid_code_demo: getDefaultDemoMermaidCode(),
            filename: '论证结构分析示例',
            file_type: '.md',
            pdf_base64: null,
          });
          setLoading(false);
          return;
        }
      }
      
      // 对于上传的文件，直接使用documentId
      const statusResponse = await axios.get(`http://localhost:8000/api/document-status/${documentId}`);
      
      if (statusResponse.data.success) {
        const docData = statusResponse.data;
        setDocument({
          document_id: docData.document_id,
          content: docData.content,
          content_with_ids: docData.content_with_ids, // 添加带段落ID的内容
          mermaid_code: docData.mermaid_code,
          mermaid_code_demo: docData.mermaid_code_demo,
          node_mappings_demo: docData.node_mappings_demo,
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
        
        console.log('📄 [文档加载] 成功加载文档');
      } else {
        const response = await axios.get(`http://localhost:8000/api/document/${documentId}`);
        
        if (response.data.success) {
          const docData = response.data;
          setDocument({
            document_id: docData.document_id,
            content: docData.content,
            content_with_ids: docData.content_with_ids, // 添加带段落ID的内容
            mermaid_code: docData.mermaid_code,
            mermaid_code_demo: docData.mermaid_code_demo,
            node_mappings_demo: docData.node_mappings_demo,
            filename: docData.filename,
            file_type: docData.file_type,
            pdf_base64: docData.pdf_base64,
          });
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

  const loadDocumentStructure = useCallback(async () => {
    try {
      console.log('📄 [开始加载] 开始加载文档结构，documentId:', documentId);
      
      // 获取文档结构信息（包含chunks）
      const structureResponse = await axios.get(`http://localhost:8000/api/document-structure/${documentId}`);
      console.log('📄 [结构响应]', structureResponse.data);
      
      if (structureResponse.data.success) {
        setDocumentStructure(structureResponse.data.structure);
        const chunks = structureResponse.data.chunks || [];
        
        console.log('📄 [文档结构] 成功加载了', chunks.length, '个内容块');
        console.log('📄 [内容块详情]', chunks.map(c => ({ 
          id: c.chunk_id, 
          heading: c.heading,
          content_length: c.content?.length || 0 
        })));
        
        // 如果有toc数据，也设置它
        if (structureResponse.data.toc) {
          setToc(structureResponse.data.toc);
          // 默认展开所有一级目录
          const topLevelItems = new Set(structureResponse.data.toc.filter(item => item.level === 1).map(item => item.id));
          setExpandedTocItems(topLevelItems);
          console.log('📄 [目录] 设置了', structureResponse.data.toc.length, '个目录项');
        } else {
          // 如果没有toc，尝试单独获取
          try {
            const tocResponse = await axios.get(`http://localhost:8000/api/document-toc/${documentId}`);
            if (tocResponse.data.success) {
              setToc(tocResponse.data.toc);
              const topLevelItems = new Set(tocResponse.data.toc.filter(item => item.level === 1).map(item => item.id));
              setExpandedTocItems(topLevelItems);
              console.log('📄 [目录单独加载] 成功加载', tocResponse.data.toc.length, '个目录项');
            }
          } catch (tocError) {
            console.warn('📄 [目录加载失败]', tocError);
          }
        }
        
        return chunks;
      } else {
        console.warn('📄 [结构加载失败]', structureResponse.data.message);
      }
    } catch (error) {
      console.error('📄 [加载文档结构错误]', error);
      if (error.response) {
        console.error('📄 [响应错误]', error.response.data);
      }
    }
    return [];
  }, [documentId]);

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