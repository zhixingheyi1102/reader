import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

export const useMindmapGeneration = (documentId, document, setDocument) => {
  const location = useLocation();
  
  const [mindmapStatus, setMindmapStatus] = useState('not_started');
  const [mindmapError, setMindmapError] = useState(null);
  const [simpleMindmapStatus, setSimpleMindmapStatus] = useState('not_started');
  const [simpleMindmapError, setSimpleMindmapError] = useState(null);
  const [demoMindmapStatus, setDemoMindmapStatus] = useState('not_started');
  
  // 从上传页面传递的模式选择
  const selectedMode = location.state?.selectedMode || 'simple';
  const [currentMindmapMode, setCurrentMindmapMode] = useState(selectedMode);
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
      if (mindmapStatus === 'generating' || simpleMindmapStatus === 'generating' || demoMindmapStatus === 'generating') {
        return { 
          text: '生成中...', 
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200'
        };
      }
      
      if (mindmapError || simpleMindmapError) {
        return { 
          text: '生成失败', 
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        };
      }
      
      const completedCount = [
        mindmapStatus === 'completed' && document?.mermaid_code,
        simpleMindmapStatus === 'completed' && document?.mermaid_code_simple,
        demoMindmapStatus === 'completed' && document?.mermaid_code_demo
      ].filter(Boolean).length;
      
      if (completedCount > 0) {
        return { 
          text: `${completedCount}个版本可用`, 
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
        {(mindmapStatus === 'generating' || simpleMindmapStatus === 'generating' || demoMindmapStatus === 'generating') && (
          <div className="animate-spin rounded-full h-3 w-3 border-b border-current mr-1"></div>
        )}
        {statusInfo.text}
      </div>
    );
  };

  const startMindmapGeneration = async (method = 'standard') => {
    try {
      // 如果是演示模式，直接设置演示代码
      if (method === 'demo') {
        setDemoMindmapStatus('generating');
        setCurrentMindmapMode('demo');
        
        // 模拟加载过程
        setTimeout(() => {
          setDocument(prev => ({
            ...prev,
            mermaid_code_demo: defaultDemoMermaidCode
          }));
          setDemoMindmapStatus('completed');
          toast.success('思维导图加载完成！');
        }, 1000);
        
        toast.success('正在加载思维导图...');
        return;
      }

      const setStatus = method === 'simple' ? setSimpleMindmapStatus : setMindmapStatus;
      const setError = method === 'simple' ? setSimpleMindmapError : setMindmapError;
      
      setStatus('generating');
      setError(null);
      setCurrentMindmapMode(method);
      
      // 获取实际的文档ID（去掉demo-前缀）
      const actualDocumentId = documentId.startsWith('demo-') 
        ? documentId.replace('demo-', '') 
        : documentId;
      
      const url = method === 'simple' 
        ? `http://localhost:8000/api/generate-mindmap-simple/${actualDocumentId}`
        : `http://localhost:8000/api/generate-mindmap/${actualDocumentId}`;
      
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
      
      if (method === 'demo') {
        setDemoMindmapStatus('error');
        toast.error('加载思维导图失败');
        return;
      }
      
      const setStatus = method === 'simple' ? setSimpleMindmapStatus : setMindmapStatus;
      const setError = method === 'simple' ? setSimpleMindmapError : setMindmapError;
      
      setStatus('error');
      setError(error.response?.data?.detail || error.message || '生成思维导图失败');
      toast.error('生成思维导图失败');
    }
  };

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
          // 获取实际的文档ID（去掉demo-前缀）
          const actualDocumentId = documentId.startsWith('demo-') 
            ? documentId.replace('demo-', '') 
            : documentId;
            
          const response = await axios.get(`http://localhost:8000/api/document-status/${actualDocumentId}`);
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
  }, [mindmapStatus, simpleMindmapStatus, documentId, setDocument]);

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

  const handleDownloadMermaid = (mode = 'standard') => {
    if (!document) return;
    
    let mermaidCode;
    let modeText;
    let modeSuffix;

    switch (mode) {
      case 'simple':
        mermaidCode = document.mermaid_code_simple;
        modeText = '快速Mermaid代码';
        modeSuffix = '_simple';
        break;
      case 'demo':
        mermaidCode = document.mermaid_code_demo;
        modeText = '完整Mermaid代码';
        modeSuffix = '_complete';
        break;
      default:
        mermaidCode = document.mermaid_code;
        modeText = '详细Mermaid代码';
        modeSuffix = '';
    }

    if (!mermaidCode) return;
    
    try {
      const blob = new Blob([mermaidCode], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      if (typeof window !== 'undefined' && window.document && typeof window.document.createElement === 'function') {
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${documentId}_mindmap${modeSuffix}.mmd`;
        if (window.document.body) {
          window.document.body.appendChild(a);
          a.click();
          window.document.body.removeChild(a);
        }
      }
      
      URL.revokeObjectURL(url);
      toast.success(`${modeText}下载成功`);
    } catch (error) {
      toast.error('下载失败：' + error.message);
    }
  };

  const handleOpenMermaidEditor = (mode = 'standard') => {
    if (!document) return;
    
    let mermaidCode;
    switch (mode) {
      case 'simple':
        mermaidCode = document.mermaid_code_simple;
        break;
      case 'demo':
        mermaidCode = document.mermaid_code_demo;
        break;
      default:
        mermaidCode = document.mermaid_code;
    }

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

  return {
    mindmapStatus,
    mindmapError,
    simpleMindmapStatus,
    simpleMindmapError,
    demoMindmapStatus,
    currentMindmapMode,
    setCurrentMindmapMode,
    autoStarted,
    startMindmapGeneration,
    handleDownloadMarkdown,
    handleDownloadMermaid,
    handleOpenMermaidEditor,
    MindmapStatusDisplay
  };
}; 