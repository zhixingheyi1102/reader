import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

export const useMindmapGeneration = (documentId, document, setDocument) => {
  const location = useLocation();
  
  const [demoMindmapStatus, setDemoMindmapStatus] = useState('not_started');
  const [autoStarted, setAutoStarted] = useState(false);

  // 默认演示流程图代码 - 现代化样式
  const defaultDemoMermaidCode = `---
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

  // MindmapStatusDisplay 组件定义
  const MindmapStatusDisplay = () => {
    const getStatusInfo = () => {
      if (demoMindmapStatus === 'generating') {
        return { 
          text: '分析中...', 
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200'
        };
      }
      
      if (demoMindmapStatus === 'error') {
        return { 
          text: '分析失败', 
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        };
      }
      
      if (demoMindmapStatus === 'completed' && document?.mermaid_code_demo) {
        return { 
          text: '论证结构已生成', 
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        };
      }
      
      return { 
        text: '未开始', 
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200'
      };
    };

    const statusInfo = getStatusInfo();
    
    return (
      <div className={`inline-flex items-center px-2 py-1 text-xs rounded border ${statusInfo.bgColor} ${statusInfo.color} ${statusInfo.borderColor}`}>
        {demoMindmapStatus === 'generating' && (
          <div className="animate-spin rounded-full h-3 w-3 border-b border-current mr-1"></div>
        )}
        {statusInfo.text}
      </div>
    );
  };

  const startMindmapGeneration = async (method = 'demo') => {
    try {
      // 如果是演示模式，直接设置演示代码或调用API
      if (method === 'demo') {
        setDemoMindmapStatus('generating');
        
        // 如果是真正的demo文档（以demo-开头但是时间戳形式），直接显示示例
        if (documentId.includes(Date.now().toString().slice(0, 8))) {
          // 模拟加载过程
          setTimeout(() => {
            setDocument(prev => ({
              ...prev,
              mermaid_code_demo: defaultDemoMermaidCode
            }));
            setDemoMindmapStatus('completed');
            toast.success('论证结构流程图加载完成！');
          }, 1000);
          
          toast.success('正在加载预设的论证结构示例...');
          return;
        }
        
        // 对于上传的文件，调用后端API
        const response = await axios.post(`http://localhost:8000/api/generate-argument-structure/${documentId}`);
        
        if (response.data.success) {
          toast.success('开始分析文档的论证结构...');
          
          if (response.data.status === 'completed' && response.data.mermaid_code) {
            setDemoMindmapStatus('completed');
            setDocument(prev => ({
              ...prev,
              mermaid_code_demo: response.data.mermaid_code,
              node_mappings_demo: response.data.node_mappings || {},
              content_with_ids: response.data.content_with_ids || prev.content_with_ids
            }));
            console.log('🔄 [AI分析立即完成] 已更新content_with_ids，包含物理分割栏:', !!response.data.content_with_ids);
            toast.success('论证结构流程图生成完成！');
          }
        } else {
          throw new Error(response.data.message || '开始分析失败');
        }
      }
    } catch (error) {
      console.error(`Start argument structure generation error:`, error);
      
      setDemoMindmapStatus('error');
      toast.error('分析论证结构失败');
    }
  };

  // 文档加载完成后自动开始生成论证结构（只运行一次）
  useEffect(() => {
    if (document && !autoStarted && documentId.startsWith('demo-')) {
      setAutoStarted(true);
      setTimeout(() => {
        startMindmapGeneration('demo');
      }, 1000);
    }
  }, [document, autoStarted, documentId]);

  // 轮询检查论证结构生成状态
  useEffect(() => {
    let interval;
    if (demoMindmapStatus === 'generating' && !documentId.includes(Date.now().toString().slice(0, 8))) {
      interval = setInterval(async () => {
        try {
          // 对于上传的真实文档，直接使用documentId（已经不带demo-前缀了）
          const actualDocumentId = documentId;
            
          const response = await axios.get(`http://localhost:8000/api/document-status/${actualDocumentId}`);
          if (response.data.success) {
            if (response.data.status_demo === 'completed' && response.data.mermaid_code_demo) {
              setDemoMindmapStatus('completed');
              setDocument(prev => ({
                ...prev,
                mermaid_code_demo: response.data.mermaid_code_demo,
                node_mappings_demo: response.data.node_mappings_demo || {},
                content_with_ids: response.data.content_with_ids || prev.content_with_ids
              }));
              console.log('🔄 [AI分析完成] 已更新content_with_ids，包含物理分割栏:', !!response.data.content_with_ids);
              toast.success('论证结构流程图生成完成！');
            } else if (response.data.status_demo === 'error') {
              setDemoMindmapStatus('error');
              toast.error('论证结构分析失败');
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
  }, [demoMindmapStatus, documentId, setDocument]);

  const handleDownloadMarkdown = () => {
    if (!document || !document.content) return;
    
    try {
      const blob = new Blob([document.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      if (typeof window !== 'undefined' && window.document && typeof window.document.createElement === 'function') {
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${document.filename || documentId}_content.md`;
        if (window.document.body) {
          window.document.body.appendChild(a);
          a.click();
          window.document.body.removeChild(a);
        }
      }
      
      URL.revokeObjectURL(url);
      toast.success('Markdown文档下载成功');
    } catch (error) {
      console.error('Download markdown error:', error);
      toast.error('下载失败：' + error.message);
    }
  };

  const handleDownloadMermaid = (mode = 'demo') => {
    if (!document || !document.mermaid_code_demo) return;
    
    try {
      const blob = new Blob([document.mermaid_code_demo], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      if (typeof window !== 'undefined' && window.document && typeof window.document.createElement === 'function') {
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${documentId}_argument_structure.mmd`;
        if (window.document.body) {
          window.document.body.appendChild(a);
          a.click();
          window.document.body.removeChild(a);
        }
      }
      
      URL.revokeObjectURL(url);
      toast.success('论证结构流程图代码下载成功');
    } catch (error) {
      toast.error('下载失败：' + error.message);
    }
  };

  const handleOpenMermaidEditor = (mode = 'demo') => {
    if (!document || !document.mermaid_code_demo) return;
    
    try {
      const safeBtoa = (str) => {
        return btoa(unescape(encodeURIComponent(str)));
      };
      
      const mermaidConfig = {
        code: document.mermaid_code_demo,
        mermaid: { theme: 'default' }
      };
      
      const configJson = JSON.stringify(mermaidConfig);
      const encodedConfig = safeBtoa(configJson);
      const url = `https://mermaid.live/edit#pako:${encodedConfig}`;
      
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error opening Mermaid editor:', error);
      
          const mermaidEditorUrl = `https://mermaid.live/edit#base64:${encodeURIComponent(document.mermaid_code_demo)}`;
    window.open(mermaidEditorUrl, '_blank');
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(document.mermaid_code_demo).then(() => {
          toast.success('流程图代码已复制到剪贴板，可手动粘贴到编辑器中');
        }).catch(() => {
          toast.error('无法打开在线编辑器，请手动复制代码');
        });
      } else {
        toast.error('无法打开在线编辑器，请使用下载功能获取代码');
      }
    }
  };

  return {
    demoMindmapStatus,
    startMindmapGeneration,
    handleDownloadMarkdown,
    handleDownloadMermaid,
    handleOpenMermaidEditor,
    MindmapStatusDisplay
  };
}; 