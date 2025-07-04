import React, { useRef } from 'react';
import FlowDiagram from '../components/FlowDiagram';

/**
 * FlowDiagram使用示例
 * 展示如何替换现有的MermaidDiagram组件
 */
const FlowDiagramExample = () => {
  const flowDiagramRef = useRef(null);

  // 示例Mermaid代码
  const sampleMermaidCode = `
    graph TD
      A[开始分析] --> B[识别核心论点]
      B --> C[分析论证结构]
      C --> D[评估证据质量]
      D --> E[检查逻辑关系]
      E --> F[得出结论]
      F --> G[撰写总结]
      
      B --> H[识别反对观点]
      H --> I[分析反驳策略]
      I --> E
  `;

  // 节点点击处理函数（与MermaidDiagram兼容）
  const handleNodeClick = (nodeId, event) => {
    console.log('节点被点击:', nodeId, event);
    alert(`点击了节点: ${nodeId}`);
  };

  // 测试ref方法
  const handleEnsureVisible = () => {
    if (flowDiagramRef.current) {
      // 调用与MermaidDiagram兼容的方法
      flowDiagramRef.current.ensureNodeVisible('C');
    }
  };

  const handleFitView = () => {
    if (flowDiagramRef.current) {
      flowDiagramRef.current.fitView();
    }
  };

  return (
    <div style={{ width: '100%', height: '600px', padding: '20px' }}>
      <h2>React Flow 图表示例</h2>
      
      <div style={{ marginBottom: '10px' }}>
        <button onClick={handleEnsureVisible} style={{ marginRight: '10px' }}>
          聚焦到节点C
        </button>
        <button onClick={handleFitView}>
          适应视图
        </button>
      </div>

      <div style={{ width: '100%', height: '500px', border: '1px solid #ccc' }}>
        <FlowDiagram 
          ref={flowDiagramRef}
          code={sampleMermaidCode}
          onNodeClick={handleNodeClick}
          layoutOptions={{
            direction: 'TB', // 上到下布局
            nodeSpacing: 100,
            rankSpacing: 150
          }}
        />
      </div>
    </div>
  );
};

/**
 * 在现有项目中替换MermaidDiagram的步骤：
 * 
 * 1. 导入新组件：
 *    import FlowDiagram from './FlowDiagram';
 *    // 替换原来的：
 *    // import MermaidDiagram from './MermaidDiagram';
 * 
 * 2. 替换组件使用：
 *    <FlowDiagram 
 *      ref={mermaidDiagramRef}  // 保持相同的ref
 *      code={document.mermaid_code_demo}  // 保持相同的props
 *      onNodeClick={handleNodeClick}      // 保持相同的回调
 *    />
 * 
 * 3. ref方法保持兼容：
 *    - ensureNodeVisible(nodeId) 
 *    - fitView()
 *    - getReactFlowInstance() (新增)
 * 
 * 4. 在ViewerPageRefactored.js中的具体替换：
 *    找到这行：
 *    <MermaidDiagram 
 *      ref={mermaidDiagramRef}
 *      code={document.mermaid_code_demo}
 *      onNodeClick={handleNodeClick}
 *    />
 *    
 *    替换为：
 *    <FlowDiagram 
 *      ref={mermaidDiagramRef}
 *      code={document.mermaid_code_demo}
 *      onNodeClick={handleNodeClick}
 *    />
 */

export default FlowDiagramExample; 